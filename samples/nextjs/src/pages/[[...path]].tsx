import { AxiosError } from 'axios';
import { GetStaticPaths, GetStaticProps, GetStaticPropsContext } from 'next';
import Error from 'next/error';
import Layout from 'components/Layout';
import { SitecoreContext } from '@sitecore-jss/sitecore-jss-nextjs';
import { SitecorePageProps, extractPath } from 'lib/page-props';
import { componentFactory } from 'temp/componentFactory';
import { configBasedLayoutService as layoutService } from 'lib/layout-service';
import { configBasedDictionaryService as dictionaryService } from 'lib/dictionary-service';
import { ComponentPropsContext } from 'lib/component-props';
import { componentPropsService } from 'lib/component-props-service';
import { config as packageConfig } from '../../package.json';

const SitecorePage = ({ layoutData, componentProps }: SitecorePageProps): JSX.Element => {
  if (!layoutData?.sitecore?.route) {
    // layoutData will be missing for an invalid path
    return <Error statusCode={404} />;
  }

  const context = {
    route: layoutData.sitecore.route,
    itemId: layoutData.sitecore.route?.itemId,
    ...layoutData.sitecore.context,
  };

  const PageLayout = () => (
    <ComponentPropsContext.Provider value={componentProps}>
      <SitecoreContext componentFactory={componentFactory} context={context}>
        <Layout route={layoutData.sitecore.route} />
      </SitecoreContext>
    </ComponentPropsContext.Provider>
  );

  return <PageLayout />;
};

// This function gets called at build and export time to determine
// pages for SSG ("paths", as tokenized array).
export const getStaticPaths: GetStaticPaths = async () => {
  // Fallback, along with revalidate in getStaticProps (below),
  // enables Incremental Static Regeneration. This allows us to
  // leave certain (or all) paths empty if desired and static pages
  // will be generated on request.
  // See https://nextjs.org/docs/basic-features/data-fetching#incremental-static-regeneration
  //
  // Ultimately, this is where we'll also be able to request a "sitemap" from Sitecore.
  return {
    paths: [],
    fallback: 'blocking',
  };
};

// This function gets called at build time on server-side.
// It may be called again, on a serverless function, if
// revalidation (or fallback) is enabled and a new request comes in.
export const getStaticProps: GetStaticProps = async (context) => {
  const { params, locale } = context;
  const path = extractPath(params);

  const props: SitecorePageProps = {
    // Use context locale if Next.js i18n is configured, otherwise use language defined in package.json
    locale: locale ?? packageConfig.language,
    layoutData: null,
    dictionary: null,
    componentProps: {},
  };

  // Retrieve layoutData from Layout Service
  props.layoutData = await layoutService
    .fetchLayoutData(path, props.locale)
    .catch((error: AxiosError) => {
      // Let 404s (invalid path) through
      if (error.response?.status === 404) return null;
      throw error;
    });

  if (props.layoutData) {
    // Retrieve component props using side-effects defined on components level
    props.componentProps = await componentPropsService.fetchComponentProps<GetStaticPropsContext>({
      layoutData: props.layoutData,
      context,
    });
  }

  // Retrieve dictionary data from Dictionary Service
  props.dictionary = await dictionaryService.fetchDictionaryData(props.locale);

  return {
    props,
    // Next.js will attempt to re-generate the page:
    // - When a request comes in
    // - At most once every 5 seconds
    revalidate: 5, // In seconds
  };
};

export default SitecorePage;