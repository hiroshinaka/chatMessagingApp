require('./utils');
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const database = include('databaseConnection');
const db_utils = include('database/db_utils');
const db_users = include('database/users');
const success = db_utils.printMySQLVersion();

const port = process.env.PORT || 3000;

const app = express();

const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app);
const io = socketIo(server);

const expireTime = 24 * 60 * 60 * 1000; //expires after 1 day  (hours * minutes * seconds * millis)

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadDir = path.join(__dirname, 'public/uploads');

/* secret information section */
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;
const mongo_cluster = process.env.MONGODB_CLUSTER;
/* END secret section */

var mongoStore = MongoStore.create({
	mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongo_cluster}.mongodb.net/sessions`,
	crypto: {
		secret: mongodb_session_secret
	}
})
const sessionMiddleware = session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
});

app.use(sessionMiddleware);

io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('joinRoom', ({room_id, username}) => {
        socket.join(room_id);
        console.log(`${username} joined room ${room_id}`);
    });
    
    socket.on("sendMessage", async ({ room_id, text }) => {
        try {
          console.log("SendMessage called by user:", socket.request.session.username);
      
          // 1. You have the user’s ID from the session
          const [userResult] = await database.query(
            "SELECT user_id FROM user WHERE username = ?",
            [socket.request.session.username]
          );
          console.log("User row for session:", userResult);
          if (!userResult.length) throw new Error("User not found in DB");
          const user_id = userResult[0].user_id;
      
          // 2. Get room_user_id
          const [roomUser] = await database.query(
            "SELECT room_user_id FROM room_user WHERE user_id = ? AND room_id = ?",
            [user_id, room_id]
          );
          if (!roomUser.length) throw new Error("User not in this room");
          const room_user_id = roomUser[0].room_user_id;
      
          // 3. Insert the message
          const [insertResult] = await database.query(
            "INSERT INTO message (room_user_id, text, sent_datetime) VALUES (?, ?, NOW())",
            [room_user_id, text]
          );
      
          // 4. Fetch the username from the DB
          const [senderRow] = await database.query(
            "SELECT username FROM user WHERE user_id = ?",
            [user_id]
          );
          if (!senderRow.length) throw new Error("Sender not found in DB");
      
          // 5. Broadcast with a valid sender property
          const messageData = {
            message_id: insertResult.insertId,
            text,
            sender: senderRow[0].username,  
            timestamp: new Date().toLocaleTimeString()
          };
      
          io.to(room_id).emit("receiveMessage", messageData);
        } catch (error) {
          console.error("Error sending message:", error);
          socket.emit("messageError", "Failed to send message.");
        }
      });
      
      
      
    
    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});


// Ensure "uploads" folder exists

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique file name
    }
});
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');

app.use(express.urlencoded({extended: false}));
app.use(express.json());





// app.use(session({ 
//     secret: node_session_secret,
// 	store: mongoStore, //default is memory store 
// 	saveUninitialized: false, 
// 	resave: true
// }
// ));

app.get('/', (req,res) => {
    res.render("index");
});

app.get('/about', (req,res) => {
    var color = req.query.color;
    if (!color) {
        color = "black";
    }

    res.render("about", {color: color} );
});

app.get('/contact', (req,res) => {
    var missingEmail = req.query.missing;
    res.render("contact", {missing: missingEmail});
});

app.get('/getMessages', async (req, res) => {
    try {
        const { chatId } = req.query;
        const [userResult] = await database.query(
            "SELECT user_id FROM user WHERE username = ?",
            [req.session.username]
        );
        const user_id = userResult[0].user_id;

        // Get last_read message ID
        const [lastReadRow] = await database.query(
            `SELECT last_read FROM room_user 
             WHERE user_id = ? AND room_id = ?`,
            [user_id, chatId]
        );
        const last_read_id = lastReadRow[0]?.last_read || 0;

        // Modified query using message IDs
        const query = `
            SELECT m.*, u.username AS sender,
                   (m.message_id > ?) AS is_unread
            FROM message m
            JOIN room_user ru ON m.room_user_id = ru.room_user_id
            JOIN user u ON ru.user_id = u.user_id
            WHERE ru.room_id = ?
            ORDER BY sent_datetime ASC
        `;
        
        const [messages] = await database.query(query, [last_read_id, chatId]);
        res.json({ messages });
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ error: "Database error" });
    }
});

app.get('/getGroupMembers', async (req, res) => {
    try {
      const { groupId } = req.query;
  
      if (!groupId) {
        return res.status(400).json({ success: false, message: "Missing group ID" });
      }
  
      // 1. Fetch group name from "room" table
      const [roomRows] = await database.query(
        "SELECT name AS group_name FROM room WHERE room_id = ?",
        [groupId]
      );
      let groupName = "Group Chat"; // default
      if (roomRows.length > 0 && roomRows[0].group_name) {
        groupName = roomRows[0].group_name;
      }
  
      // 2. Fetch group members
      const [members] = await database.query(`
        SELECT u.user_id, u.username, u.profile_img
        FROM user u
        JOIN room_user ru ON u.user_id = ru.user_id
        WHERE ru.room_id = ?
      `, [groupId]);
    
        if (members.length == 2){
            const currentUserId = req.session.currentUserId;
            const other = members.find(member => member.user_id !== currentUserId);
            if (other) {
                groupName = other.username;
            }
        }
      res.json({ success: true, group_name: groupName, members });
    } catch (error) {
      console.error("Error fetching group members:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  

app.get('/createTables', async (req,res) => {

    const create_tables = include('database/create_tables');

    var success = create_tables.createTables();
    if (success) {
        res.render("successMessage", {message: "Created tables."} );
    }
    else {
        res.render("errorMessage", {error: "Failed to create tables."} );
    }
});

app.get('/createUser', (req,res) => {
    res.render("createUser");
});

app.post('/react', async (req, res) => {
    try {
        const { message_id, user_id, emoji_id } = req.body;
        const query = "INSERT INTO messages_reacted (message_id, user_id, emoji_id) VALUES (?, ?, ?)";

        await database.query(query, [message_id, user_id, emoji_id]);
        
        io.emit('message reaction', { message_id, user_id, emoji_id });
        res.sendStatus(200);
    } catch (error) {
        console.error("Error saving reaction:", error);
        res.status(500).json({ error: "Database error" });
    }
});


app.post('/createRoom', async (req, res) => {
    try {
        const { room_name, user_ids } = req.body;

        // Validate input
        if (!Array.isArray(user_ids)) {
            return res.status(400).json({ success: false, message: "Invalid data provided." });
        }

        // 1. Get current user's ID from session
        const [userResult] = await database.query(
            "SELECT user_id FROM user WHERE username = ?",
            [req.session.username]
        );
        if (userResult.length === 0) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        const currentUserId = userResult[0].user_id;

        // 2. Check if we're creating a private chat
        // Updated private chat logic in /createRoom
        if (user_ids.length === 1) {
            const otherUserId = parseInt(user_ids[0], 10);
            const lowestId = Math.min(otherUserId, currentUserId);
            const highestId = Math.max(otherUserId, currentUserId);
            const roomName = `private_${lowestId}_${highestId}`;

            // Check for existing private chat using the standardized name
            const [existingRoom] = await database.query(
                "SELECT room_id FROM room WHERE name = ?",
                [roomName]
            );
            if (existingRoom.length > 0) {
                return res.json({ success: true, room_id: existingRoom[0].room_id });
            }

            // Create new private chat
            const [roomResult] = await database.query(
                "INSERT INTO room (name, start_datetime) VALUES (?, NOW())",
                [roomName]
            );
            const roomId = roomResult.insertId;

            // Insert both users
            await database.query(
                "INSERT INTO room_user (user_id, room_id, last_read) VALUES (?, ?, NULL), (?, ?, NULL)",
                [currentUserId, roomId, otherUserId, roomId]
            );

            return res.json({ success: true, message: "Private chat created", room_id: roomId });
        }
                
        else {
            // Group chat logic
            const participants = [...new Set([...user_ids, currentUserId.toString()])];

            // Check for existing group with same participants
            const [existingGroup] = await database.query(
                `SELECT room_id 
                FROM room_user 
                WHERE user_id IN (?)
                GROUP BY room_id
                HAVING COUNT(DISTINCT user_id) = ?`,
                [participants, participants.length]
            );

            if (existingGroup.length > 0) {
                return res.json({ success: true, room_id: existingGroup[0].room_id });
            }

            // Create new group with provided name or default name
            const groupName = room_name || `Group ${Date.now()}`;
            const [roomResult] = await database.query(
                "INSERT INTO room (name, start_datetime) VALUES (?, NOW())",
                [groupName]
            );
            const roomId = roomResult.insertId;

            // Insert all participants
            const values = participants.map(user_id => [user_id, roomId, NULL]);         
            await database.query(
                "INSERT INTO room_user (user_id, room_id, last_read) VALUES ?",
                [values]
            );

            return res.json({ success: true, message: "Group chat created", room_id: roomId });
        }
    } catch (error) {
        console.error("Error creating chat:", error);
        res.status(500).json({ success: false, message: "Server error." });
    }
});
app.get('/login', (req,res) => {
    res.render("login");
});

app.post('/submitUser', upload.single('profile_img'), async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if file was uploaded
        let profileImgPath = "/default.png"; // Default image
        if (req.file) {
            profileImgPath = `/uploads/${req.file.filename}`; // Set uploaded file path
        }

        const hashedPassword = bcrypt.hashSync(password, saltRounds);

        // Call createUser function
        const userCreated = await db_users.createUser({
            user: username,
            email: email,
            hashedPassword: hashedPassword,
            profile_img: profileImgPath
        });

        if (userCreated) {
            return res.redirect('/login'); // ✅ Success
        } else {
            return res.render("errorMessage", { error: "Failed to create user." });
        }
    } catch (error) {
        console.error("Error submitting user:", error);
        return res.status(500).render("errorMessage", { error: "Server error" });
    }
});
// Add this endpoint to update last_read
app.post('/updateLastRead', async (req, res) => {
    try {
        const { room_id, last_message_id } = req.body;
        const [userResult] = await database.query(
            "SELECT user_id FROM user WHERE username = ?",
            [req.session.username]
        );
        const user_id = userResult[0].user_id;

        // Verify message exists first
        const [messageCheck] = await database.query(
            "SELECT message_id FROM message WHERE message_id = ?",
            [last_message_id]
        );
        
        if (!messageCheck.length) {
            return res.status(400).json({ success: false, message: "Invalid message ID" });
        }

        await database.query(
            `UPDATE room_user 
             SET last_read = ?
             WHERE user_id = ? AND room_id = ?`,
            [last_message_id, user_id, room_id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error("Error updating last read:", error);
        res.status(500).json({ 
            success: false,
            message: error.sqlMessage || "Database error"
        });
    }
});

app.post('/loggingin', async (req,res) => {
    var username = req.body.username;
    var password = req.body.password;


    var results = await db_users.getUser({ user: username });
    if (results && results.length === 1) { // Ensure exactly 1 matching user
        const user = results[0];
        if (bcrypt.compareSync(password, user.password_hash)) {
            req.session.authenticated = true;
            req.session.username = username;
            req.session.cookie.maxAge = expireTime;
        
            return res.redirect(`/${username}/chat`);
            }
            else {
                console.log("invalid password");
            }
        }
        else {
            console.log('invalid number of users matched: '+results.length+" (expected 1).");
            res.redirect('/login');
            return;            
        }
    


    console.log('user not found');
    //user and password combination not found
    res.redirect("/login");
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
        }
        res.redirect('/');
    });
});

function isValidSession(req) {
	if (req.session.authenticated) {
		return true;
	}
	return false;
}

function sessionValidation(req, res, next) {
	if (!isValidSession(req)) {
		req.session.destroy();
		res.redirect('/login');
		return;
	}
	else {
		next();
	}
}

function sendReaction(message_id, emoji_id) {
    fetch('/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id, user_id: currentUserId, emoji_id })
    });
}


function isAdmin(req) {
    if (req.session.user_type == 'admin') {
        return true;
    }
    return false;
}

function adminAuthorization(req, res, next) {
	if (!isAdmin(req)) {
        res.status(403);
        res.render("errorMessage", {error: "Not Authorized"});
        return;
	}
	else {
		next();
	}
}

app.use('/loggedin', sessionValidation);
app.use('/loggedin/admin', adminAuthorization);

app.get('/loggedin', (req,res) => {
    res.render("loggedin");
});

app.get('/loggedin/info', (req,res) => {
    res.render("loggedin-info");
});

app.get('/loggedin/admin', (req,res) => {
    res.render("admin");
});

app.get('/loggedin/memberinfo', (req,res) => {
    res.render("memberInfo", {username: req.session.username, user_type: req.session.user_type});
});

app.get('/:username/chat', async (req, res) => {
    try {
        if (!req.session.username) return res.redirect('/login');

        const [userResult] = await database.query(
            "SELECT user_id FROM user WHERE username = ?",
            [req.session.username]
        );
        if (userResult.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        const currentUserId = userResult[0].user_id;
        const profile_img = userResult[0].profile_img || '/default-avatar.png';
        console.log(profile_img);

        // Fetch all users for the "Create Chat" modal
        const [allUsers] = await database.query(
            "SELECT user_id, username FROM user WHERE user_id != ?",
            [currentUserId]
        );

        // Fetch all chats (private & group)
        const [chatList] = await database.query(`
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
                AND m.message_id > (SELECT last_read FROM room_user WHERE user_id = ? AND room_id = r.room_id)
                ) AS unread_count
            FROM room r
            JOIN room_user ru1 ON r.room_id = ru1.room_id
            JOIN room_user ru2 ON r.room_id = ru2.room_id
            JOIN user u ON ru2.user_id = u.user_id
            WHERE ru1.user_id = ?
            AND ru2.user_id != ?
            AND (SELECT COUNT(DISTINCT ruX.user_id) FROM room_user ruX WHERE ruX.room_id = r.room_id) = 2
            
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
                AND m.message_id > (SELECT last_read FROM room_user WHERE user_id = ? AND room_id = r.room_id)
                ) AS unread_count
            FROM room r
            JOIN room_user ru ON r.room_id = ru.room_id
            WHERE ru.user_id = ?
            AND r.name IS NOT NULL
            AND r.name NOT LIKE 'private_%'
        `, [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]);
                

        console.log("Chat List Data:", chatList); // Debugging log

        res.render('chat', {
            username: req.session.username,
            profile_img,
            allUsers,  // List of all users
            chatList   // List of chats (users & groups)
        });
    } catch (error) {
        console.error("Error fetching chat data:", error);
        res.status(500).json({ error: "Database error" });
    }
});
app.get('/api', (req,res) => {
	var user = req.session.user;
    var user_type = req.session.user_type;
	console.log("api hit ");

	var jsonResponse = {
		success: false,
		data: null,
		date: new Date()
	};

	
	if (!isValidSession(req)) {
		jsonResponse.success = false;
		res.status(401);  //401 == bad user
		res.json(jsonResponse);
		return;
	}

	if (typeof id === 'undefined') {
		jsonResponse.success = true;
		if (user_type === "admin") {
			jsonResponse.data = ["A","B","C","D"];
		}
		else {
			jsonResponse.data = ["A","B"];
		}
	}
	else {
		if (!isAdmin(req)) {
			jsonResponse.success = false;
			res.status(403);  //403 == good user, but, user should not have access
			res.json(jsonResponse);
			return;
		}
		jsonResponse.success = true;
		jsonResponse.data = [id + " - details"];
	}

	res.json(jsonResponse);

});

app.use(express.static(__dirname + "/public"));

app.get("*", (req,res) => {
	res.status(404);
	res.render("404");
})

server.listen(port, () => {
	console.log("Node application listening on port "+port);
}); 