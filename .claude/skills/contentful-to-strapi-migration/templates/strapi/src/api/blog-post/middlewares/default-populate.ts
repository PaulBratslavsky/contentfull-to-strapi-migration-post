/**
 * Auto-populate relations + media on blog-post find/findOne unless the request
 * already specifies populate.
 */
export default (config, { strapi }) => {
  return async (ctx, next) => {
    if (!ctx.query.populate) {
      ctx.query.populate = {
        coverImage: { fields: ['name', 'alternativeText', 'url', 'width', 'height'] },
        author: { fields: ['name', 'bio'], populate: { avatar: { fields: ['url'] } } },
        category: { fields: ['title', 'slug'] },
      };
    }
    await next();
  };
};
