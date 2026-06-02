/**
 * Example INCREMENTAL migration: add only the `product` content type to a space
 * that already has the blog model — without recreating the existing types.
 *
 * Why this exists: Contentful migrations have no state tracking, and
 * `createContentType` errors if a type already exists. So `001-blog-model.js`
 * (which now includes `product`) is run-once per fresh space. If you already
 * seeded a space with an earlier model and just want to add products, run this
 * one once instead:
 *
 *   contentful space migration --yes migrations/002-add-product.js
 *
 * Fresh spaces don't need this — `npm run model` already creates `product`.
 */
module.exports = function (migration) {
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
