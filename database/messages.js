const database = include('./databaseConnection.js');

// Get the current user's ID based on their username
async function getUserIdByUsername(username) {
    const sql = "SELECT user_id FROM user WHERE username = ?";
    try {
        const [rows] = await database.query(sql, [username]);
        return rows;
    } catch (err) {
        console.error("Error fetching user:", err);
        throw err;
    }
}

// Get the last_read message ID for a user in a given room
async function getLastReadMessage(user_id, room_id) {
    const sql = `
        SELECT last_read 
        FROM room_user 
        WHERE user_id = ? AND room_id = ?
    `;
    try {
        const [rows] = await database.query(sql, [user_id, room_id]);
        return rows;
    } catch (err) {
        console.error("Error fetching last read message:", err);
        throw err;
    }
}

// Get all messages for a room, marking messages as unread based on last_read message ID
async function getMessages(last_read, room_id) {
    const sql = `
        SELECT m.*, u.username AS sender,
               (m.message_id > ?) AS is_unread
        FROM message m
        JOIN room_user ru ON m.room_user_id = ru.room_user_id
        JOIN user u ON ru.user_id = u.user_id
        WHERE ru.room_id = ?
        ORDER BY sent_datetime ASC
    `;
    try {
        const [rows] = await database.query(sql, [last_read, room_id]);
        return rows;
    } catch (err) {
        console.error("Error fetching messages:", err);
        throw err;
    }
}

module.exports = {
    getUserIdByUsername,
    getLastReadMessage,
    getMessages
};