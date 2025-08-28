require('dotenv').config({ debug: true });
console.log('ENCODING OK, VARS:', {
  EMARSYS_USER: process.env.EMARSYS_USER,
  EMARSYS_SECRET: process.env.EMARSYS_SECRET,
  EMARSYS_BEARER_TOKEN: process.env.EMARSYS_BEARER_TOKEN?.slice(0, 6) + '...' // não loga tudo
});