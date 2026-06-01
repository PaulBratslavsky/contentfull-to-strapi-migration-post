/**
 * Contentful migration DSL: creates the blog content model.
 *
 * Run with the Contentful CLI:
 *   contentful space migration migrations/001-blog-model.js
 *
 * This is reproducible and version-controllable — re-running against a fresh
 * space recreates the exact same model. Mirrors the content types the Strapi
 * destination expects.
 */
module.exports = function (migration) {
  // --- Author --------------------------------------------------------------
  const author = migration
    .createContentType('author')
    .name('Author')
    .displayField('name');
  author.createField('name').name('Name').type('Symbol').required(true);
  author.createField('bio').name('Bio').type('Text');
  author.createField('avatar').name('Avatar').type('Link').linkType('Asset');

  // --- Category ------------------------------------------------------------
  const category = migration
    .createContentType('category')
    .name('Category')
    .displayField('title');
  category.createField('title').name('Title').type('Symbol').required(true);
  category
    .createField('slug')
    .name('Slug')
    .type('Symbol')
    .required(true)
    .validations([{ unique: true }]);
  category.createField('description').name('Description').type('Text');

  // --- Blog Post -----------------------------------------------------------
  const blogPost = migration
    .createContentType('blogPost')
    .name('Blog Post')
    .displayField('title');
  blogPost.createField('title').name('Title').type('Symbol').required(true);
  blogPost
    .createField('slug')
    .name('Slug')
    .type('Symbol')
    .required(true)
    .validations([{ unique: true }]);
  blogPost.createField('excerpt').name('Excerpt').type('Text');
  blogPost.createField('body').name('Body').type('RichText');
  blogPost.createField('coverImage').name('Cover Image').type('Link').linkType('Asset');
  blogPost.createField('publishedDate').name('Published Date').type('Date');
  blogPost.createField('tags').name('Tags').type('Object');
  blogPost
    .createField('author')
    .name('Author')
    .type('Link')
    .linkType('Entry')
    .validations([{ linkContentType: ['author'] }]);
  blogPost
    .createField('category')
    .name('Category')
    .type('Link')
    .linkType('Entry')
    .validations([{ linkContentType: ['category'] }]);

  // --- Landing Page --------------------------------------------------------
  const landingPage = migration
    .createContentType('landingPage')
    .name('Landing Page')
    .displayField('heroTitle');
  landingPage.createField('heroTitle').name('Hero Title').type('Symbol');
  landingPage.createField('heroSubtitle').name('Hero Subtitle').type('Text');
  landingPage.createField('heroImage').name('Hero Image').type('Link').linkType('Asset');
  landingPage
    .createField('featuredPosts')
    .name('Featured Posts')
    .type('Array')
    .items({
      type: 'Link',
      linkType: 'Entry',
      validations: [{ linkContentType: ['blogPost'] }],
    });
};
