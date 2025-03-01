const database = include('./databaseConnection.js');

//Function to add users to the database when they register
async function createUser(postData) {
    let createUserSQL = `
    INSERT INTO user (username, email, password_hash, profile_img)
    VALUES (?, ?, ?, ?)`;

    try {
        const [result] = await database.query(createUserSQL, [
            postData.user,
            postData.email,
            postData.hashedPassword,
            postData.profile_img
        ]);

        if (result.affectedRows > 0) {
            return true;
        } else {
            return false; 
        }
    } catch (err) {
        console.log("Error inserting user:", err);
        return false;
    }
}

async function getAllUsers(currentUserId) {
    const sql = `SELECT user_id, username FROM user WHERE user_id != ?`;
    try {
        const [rows] = await database.query(sql, [currentUserId]);
        return rows;
    } catch (err) {
        console.error("Error fetching all users:", err);
        throw err;
    }
}


async function getUser({user}){
    let getUserSQL =`
    SELECT user_id, username, email, password_hash, profile_img
    From user
    WHERE username = ?`
    ;
    try{
        const [rows] = await database.query(getUserSQL, [user]);
        return rows;
    }
    catch(err){
        console.log(err);
        return false;
    }
}
async function getUserByUsername(username) {
    const sql = `SELECT user_id, profile_img FROM user WHERE username = ?`;
    try {
        const [rows] = await database.query(sql, [username]);
        return rows;
    } catch (err) {
        console.error("Error fetching user:", err);
        throw err;
    }
}


// Get chat list (both private and group chats)
async function getChatList(currentUserId) {
    const sql = `
        SELECT
            r.room_id,
            ru2.user_id,
            u.username AS chat_name,
            u.profile_img,
            'user' AS type,
            (SELECT COUNT(*) 
                FROM message m
                JOIN room_user ru ON m.room_user_id = ru.room_user_id
                WHERE ru.room_id = r.room_id
                AND m.message_id > (
                    SELECT last_read FROM room_user WHERE user_id = ? AND room_id = r.room_id
                )
            ) AS unread_count
        FROM room r
        JOIN room_user ru1 ON r.room_id = ru1.room_id
        JOIN room_user ru2 ON r.room_id = ru2.room_id
        JOIN user u ON ru2.user_id = u.user_id
        WHERE ru1.user_id = ?
        AND ru2.user_id != ?
        AND (
            SELECT COUNT(DISTINCT ruX.user_id) 
            FROM room_user ruX 
            WHERE ruX.room_id = r.room_id
        ) = 2
        
        UNION
        
        SELECT
            r.room_id,
            NULL AS user_id,
            r.name AS chat_name,
            '/group-avatar.png' AS profile_img,
            'group' AS type,
            (SELECT COUNT(*) 
                FROM message m
                JOIN room_user ru ON m.room_user_id = ru.room_user_id
                WHERE ru.room_id = r.room_id
                AND m.message_id > (
                    SELECT last_read FROM room_user WHERE user_id = ? AND room_id = r.room_id
                )
            ) AS unread_count
        FROM room r
        JOIN room_user ru ON r.room_id = ru.room_id
        WHERE ru.user_id = ?
        AND r.name IS NOT NULL
        AND r.name NOT LIKE 'private_%'
    `;
    try {
        const params = [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId];
        const [rows] = await database.query(sql, params);
        return rows;
    } catch (err) {
        console.error("Error fetching chat list:", err);
        throw err;
    }
}


module.exports ={createUser, getUser,getAllUsers, getChatList, getUserByUsername};