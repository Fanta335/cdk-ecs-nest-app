export default () => ({
  database: {
    type: 'mysql',
    host: process.env.HOST,
    port: process.env.PORT,
    username: process.env.USERNAME,
    password: process.env.PASSWORD,
    database: process.env.DBNAME,
    entities: [`${__dirname}/../dist/**/*.entity.{js,ts}`],
    synchronize: process.env.NODE_ENV === 'develop' ? true : false,
  },
});
