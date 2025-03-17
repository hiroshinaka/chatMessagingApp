const database = include('./databaseConnection.js');

// Get the current user by username
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

// Check for an existing private room using the standardized room name
async function getExistingPrivateRoom(roomName) {
    const sql = "SELECT room_id FROM room WHERE name = ?";
    try {
        const [rows] = await database.query(sql, [roomName]);
        return rows;
    } catch (err) {
        console.error("Error fetching private room:", err);
        throw err;
    }
}

// Create a new room (private or group) and return its ID
async function createRoom(roomName) {
    const sql = "INSERT INTO room (name, start_datetime) VALUES (?, NOW())";
    try {
        const [result] = await database.query(sql, [roomName]);
        return result.insertId;
    } catch (err) {
        console.error("Error creating room:", err);
        throw err;
    }
}

// Insert one or more users into a room
async function addRoomUsers(roomId, users) {
    try {
        const [maxMsg] = await database.query(
            "SELECT COALESCE(MAX(message_id), 0) AS max_id FROM message"
        );
        const lastRead = maxMsg[0].max_id;
        const values = users.map(user => [user[0], roomId, lastRead]);
        const sql = "INSERT INTO room_user (user_id, room_id, last_read) VALUES ?";
        await database.query(sql, [values]);
    } catch (err) {
        console.error("Error inserting room users:", err);
        throw err;
    }
}


// Check for an existing group room that exactly matches the provided participants
async function getExistingGroupRoom(participants) {
    const sql = `
        SELECT room_id 
        FROM room_user 
        WHERE user_id IN (?)
        GROUP BY room_id
        HAVING COUNT(DISTINCT user_id) = ?
    `;
    try {
        const [rows] = await database.query(sql, [participants, participants.length]);
        return rows;
    } catch (err) {
        console.error("Error fetching group room:", err);
        throw err;
    }
}
//Get the group name from the "room" table by group ID
async function getRoomGroupName(groupId) {
    const sql = "SELECT name AS group_name FROM room WHERE room_id = ?";
    try {
        const [rows] = await database.query(sql, [groupId]);
        return rows;
    } catch (err) {
        console.error("Error fetching group name:", err);
        throw err;
    }
}

//Get group members from the "user" and "room_user" tables by group ID
async function getGroupMembers(groupId) {
    const sql = `
        SELECT u.user_id, u.username, u.profile_img
        FROM user u
        JOIN room_user ru ON u.user_id = ru.user_id
        WHERE ru.room_id = ?
    `;
    try {
        const [rows] = await database.query(sql, [groupId]);
        return rows;
    } catch (err) {
        console.error("Error fetching group members:", err);
        throw err;
    }
}

async function inviteUserToRoom(roomId, invitedUserId) {
    try {
        // 1. Get current members
        const [members] = await database.query(
            'SELECT COUNT(*) as count FROM room_user WHERE room_id = ?',
            [roomId]
        );
        const memberCount = members[0].count;

        // 2. Check if user exists
        const [exists] = await database.query(
            'SELECT * FROM room_user WHERE room_id = ? AND user_id = ?',
            [roomId, invitedUserId]
        );
        
        if (exists.length > 0) {
            return { success: false, message: 'User already in group' };
        }

        // 3. Insert new member
        await database.query(
            'INSERT INTO room_user (user_id, room_id, last_read) VALUES (?, ?, ?)',
            [invitedUserId, roomId, 0]
        );

        return { success: true };
    } catch (error) {
        console.error('Database error:', error);
        return { success: false, message: 'Database operation failed' };
    }
}

module.exports = {
    getUserIdByUsername,
    getExistingPrivateRoom,
    createRoom,
    addRoomUsers,
    getExistingGroupRoom,
    getRoomGroupName,
    getGroupMembers,
    inviteUserToRoom
};