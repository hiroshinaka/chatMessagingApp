const mysql = require('mysql2/promise');

const dbConfig = {
	host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
	user: process.env.MYSQL_USER,
	password: process.env.MYSQL_PASSWORD,
	database: process.env.MYSQL_DATABASE,
	multipleStatements: false,
	namedPlaceholders: true,
	waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

var database = mysql.createPool(dbConfig);

module.exports = database;