/**
 * Contentful migration DSL: creates the sample content model — a blog (author,
 * category, blog post, landing page) PLUS a product collection, so the example
 * shows the migration handling more than just blog content.
 *
 * Run with the Contentful CLI:
 *   contentful space migration migrations/001-blog-model.js
 *
 * This is reproducible and version-controllable — re-running against a fresh
 * space recreates the exact same model.
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

  // --- Product (an e-commerce-style type, to show this isn't blog-only) -----
  const product = migration
    .createContentType('product')
    .name('Product')
    .displayField('title');
  product.createField('title').name('Title').type('Symbol').required(true);
  product
    .createField('slug')
    .name('Slug')
    .type('Symbol')
    .required(true)
    .validations([{ unique: true }]);
  product.createField('description').name('Description').type('Text');
  product.createField('price').name('Price').type('Number');
  product.createField('sku').name('SKU').type('Symbol');
  product.createField('image').name('Image').type('Link').linkType('Asset');
  // Array<Symbol> — the skill can PROMOTE this to its own `tag` collection + relation.
  product.createField('tags').name('Tags').type('Array').items({ type: 'Symbol' });
};
