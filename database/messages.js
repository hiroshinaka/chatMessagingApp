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
    // 1. Fetch basic message info
    const messagesSql = `
        SELECT m.*, u.username AS sender,
               (m.message_id > ?) AS is_unread
        FROM message m
        JOIN room_user ru ON m.room_user_id = ru.room_user_id
        JOIN user u ON ru.user_id = u.user_id
        WHERE ru.room_id = ?
        ORDER BY m.sent_datetime ASC
    `;
    let [rows] = await database.query(messagesSql, [last_read, room_id]);

    if (!rows.length) {
        return rows; // If no messages, return empty array
    }

    // 2. Gather all message IDs
    const messageIds = rows.map(msg => msg.message_id);

    // 3. Query reactions for these messages
    const reactionsSql = `
        SELECT mr.message_id, e.emoji_id, e.image, COUNT(*) AS count
        FROM messages_reacted mr
        JOIN emoji e ON mr.emoji_id = e.emoji_id
        WHERE mr.message_id IN (?)
        GROUP BY mr.message_id, e.emoji_id, e.image
    `;
    const [reactionRows] = await database.query(reactionsSql, [messageIds]);

    // 4. Organize reactions by message_id
    const reactionsByMessage = {};
    for (let row of reactionRows) {
        if (!reactionsByMessage[row.message_id]) {
            reactionsByMessage[row.message_id] = [];
        }
        reactionsByMessage[row.message_id].push({
            emoji_id: row.emoji_id,
            image: row.image,
            count: row.count
        });
    }

    // 5. Attach a .reactions array to each message row
    rows = rows.map(msg => {
        msg.reactions = reactionsByMessage[msg.message_id] || [];
        return msg;
    });

    return rows;
}
module.exports = {
    getUserIdByUsername,
    getLastReadMessage,
    getMessages
};