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


async function getUser(postData){
    let getUserSQL =`
    SELECT user_id, username, email, password_hash, profile_img
    From user
    WHERE username = ?`
    ;
    try{
        const [rows] = await database.query(getUserSQL, [postData.user]);
        return rows;
    }
    catch(err){
        console.log(err);
        return false;
    }
}


module.exports ={createUser, getUser};