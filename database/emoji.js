const database = include('./databaseConnection.js');

async function getAllEmojis() {
    const [rows] = await database.query('SELECT * FROM emoji');
    return rows;
}

module.exports = { getAllEmojis };