/**
 * Auto-populate hero image + featured posts on the landing-page single type.
 */
export default (config, { strapi }) => {
  return async (ctx, next) => {
    if (!ctx.query.populate) {
      ctx.query.populate = {
        heroImage: { fields: ['name', 'alternativeText', 'url', 'width', 'height'] },
        featuredPosts: { fields: ['title', 'slug', 'excerpt'], populate: { coverImage: { fields: ['url'] } } },
      };
    }
    await next();
  };
};
