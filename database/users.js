const database = include('./databaseConnection.js');

//Function to add users to the database when they register
async function createUser(postData){
    let createUserSQL =
    `INSERT INTO users (user, email, password_hash)
    VALUES (:user, :email, :password)`;

    let params ={
        user: postData.user,
        email: postData.email,
        password: postData.hashedPassword
    }
    try{
        const result = await database.query(createUserSQL, params);

    }
    catch(err){
        console.log(err);
        return false;
    }
}

async function getUser(postData){
    let getUserSQL =`
    SELECT user_id, user, email, password_hash
    From users
    WHERE user = ?`
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