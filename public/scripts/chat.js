document.addEventListener('DOMContentLoaded', function() {
    // Initialize socket connection for real-time messaging
const socket = io();

// Global variables to track the current chat and its type
let currentChatId = null;
let isGroupChat = false;
const username = window.username;  
/* ===============================================
   Function: openChat(chatId, chatType)
   - Loads messages for the selected chat
   - Handles mobile view by toggling visibility of chat list
   - Fetches messages from server and updates UI
   - If a group chat, fetches and displays group member info
=============================================== */
function openChat(chatId, chatType) {
    console.log("Chat Clicked:", chatId, chatType); // Debug log

    // For mobile devices: hide chat list and show chat window
    if (window.innerWidth <= 768) {
        document.querySelector('.chat-window').classList.add('active');
        document.querySelector('.chat-list').style.display = 'none';
    }

    // Validate chat parameters before proceeding
    if (!chatId || chatId.trim() === "") {
        console.error("Invalid chat parameters:", chatId, chatType);
        alert("Error: Invalid chat selected. Please try again.");
        return;
    }

    // Set global variables based on chat type
    isGroupChat = (chatType === 'group');
    currentChatId = chatId;

    // Fetch messages from the server for the selected chat
    fetch(`/getMessages?chatId=${chatId}&isGroup=${isGroupChat}`)
        .then(response => response.json())
        .then(data => {
            console.log("API Response:", data); // Debug log
            if (!data.messages || !Array.isArray(data.messages)) {
                console.error("Error: 'messages' field is missing/invalid in response", data);
                return;
            }

            // Clear any previous messages and display new ones
            const messagesDiv = document.getElementById("chat-messages");
            messagesDiv.innerHTML = "";

            data.messages.forEach(msg => {
                displayMessage(msg);
            });

            // Auto-scroll to the latest message and update read status
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            updateLastRead();

            // For group chats, fetch and display group member details
            if (isGroupChat) {
                fetch(`/getGroupMembers?groupId=${chatId}`)
                    .then(response => response.json())
                    .then(groupData => {
                        console.log("Group Members API Response:", groupData); // Debug log
                        document.getElementById("chat-username").textContent = groupData.group_name;
                        const membersList = document.getElementById("group-members-list");
                        membersList.innerHTML = ""; // Clear previous list

                        if (groupData.success && Array.isArray(groupData.members)) {
                            groupData.members.forEach(member => {
                                const memberItem = document.createElement("li");
                                memberItem.innerHTML = `
                                    <img src="${member.profile_img || '/default-avatar.png'}"
                                         class="avatar-small">
                                    ${member.username}
                                `;
                                membersList.appendChild(memberItem);
                            });
                        } else {
                            console.error("Error: Invalid group members response", groupData);
                        }
                    })
                    .catch(error => console.error("Error fetching group members:", error));
            }
        })
        .catch(error => console.error("Error fetching messages:", error));

    // Remove unread badge from chat list for the opened chat
    const chatItem = document.querySelector(`.chat-item[data-room-id="${chatId}"]`);
    if (chatItem) {
        chatItem.classList.remove('unread');
        const badge = chatItem.querySelector('.unread-badge');
        if (badge) badge.remove();
    }
}
window.openChat = openChat;
/* ===============================================
   Socket.io Event Handling: receiveMessage
   - Listens for incoming messages
   - Updates the message display and handles unread notifications
=============================================== */
socket.on('receiveMessage', (msg) => {
    displayMessage(msg);

    // If message is for a chat not currently open, update unread count
    const chatItem = document.querySelector(`.chat-item[data-room-id="${msg.room_id}"]`);
    if (chatItem && msg.room_id !== currentChatId) {
        chatItem.classList.add('unread');
        let badge = chatItem.querySelector('.unread-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.classList.add('unread-badge');
            badge.textContent = '1';
            chatItem.appendChild(badge);
        } else {
            badge.textContent = parseInt(badge.textContent) + 1;
        }
    }
});

/* ===============================================
   Function: displayMessage(msg)
   - Creates and appends message elements to the chat window
   - Handles display of reactions if any exist
=============================================== */
function displayMessage(msg) {
    console.log('msg.sender:', msg.sender, '| local username:', username);
    const messagesDiv = document.getElementById("chat-messages");
    const li = document.createElement('div');
    // Apply different styling depending on sender
    li.className = msg.sender === username ? "my-message" : "other-message";
    li.dataset.messageId = msg.message_id;

    // Build HTML for message reactions if present
    let reactionsHtml = '';
    if (msg.reactions?.length > 0) {
        reactionsHtml = `<div class="reactions">`;
        msg.reactions.forEach(reaction => {
            reactionsHtml += `
            <span class="emoji-reaction" data-emoji-id="${reaction.emoji_id}">
                <span class="emoji-character">${reaction.image}</span>
                <span class="count">${reaction.count}</span>
            </span>
        `;
        });
        reactionsHtml += '</div>';
    }

    // Construct message content including a button to trigger reactions
    li.innerHTML = `
        <div class="message-content">
            <strong>${msg.sender}:</strong> ${msg.text}
            ${reactionsHtml}
            <button class="react-button">+</button>
        </div>
    `;
    messagesDiv.appendChild(li);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/* ===============================================
   Global Event Listener for React Button
   - Delegates click events on the chat messages container
   - Opens or closes the emoji picker for message reactions
=============================================== */
document.getElementById('chat-messages').addEventListener('click', async (e) => {
    if (e.target.classList.contains('react-button')) {
        const messageElement = e.target.closest('.my-message, .other-message');
        if (!messageElement) return;

        // Toggle emoji picker: remove if already open, otherwise display it
        const existingPicker = messageElement.querySelector('.emoji-picker');
        if (existingPicker) {
            existingPicker.remove();
        } else {
            const messageId = messageElement.dataset.messageId;
            showEmojiPicker(messageElement, messageId);
        }
    }
});

/* ===============================================
   Function: showEmojiPicker(messageElement, messageId)
   - Fetches emoji data if not already loaded
   - Creates and appends an emoji picker to the message content
=============================================== */
async function showEmojiPicker(messageElement, messageId) {
    // Fetch emoji data from the server if not cached
    if (!window.emojis) {
        try {
            const response = await fetch('/emojis');
            window.emojis = await response.json();
        } catch (err) {
            console.error('Error fetching /emojis:', err);
            return;
        }
    }

    // Create the emoji picker container and populate with options
    const picker = document.createElement('div');
    picker.className = 'emoji-picker';

    window.emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-option';
        btn.textContent = emoji.image;  // Display the emoji character
        btn.onclick = () => sendReaction(messageId, emoji.emoji_id);
        picker.appendChild(btn);
    });

    // Append the picker to the message content, ensuring no duplicate pickers exist
    const msgContent = messageElement.querySelector('.message-content');
    const oldPicker = msgContent.querySelector('.emoji-picker');
    if (oldPicker) oldPicker.remove();
    msgContent.appendChild(picker);
}

/* ===============================================
   Function: sendReaction(messageId, emojiId)
   - Sends the selected emoji reaction to the server
=============================================== */
function sendReaction(messageId, emojiId) {
    fetch('/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, emoji_id: emojiId })
    }).catch(console.error);
}

/* ===============================================
   Socket.io Event Handling: reactionUpdate
   - Updates the UI with new reaction counts or removes reactions if count is 0
=============================================== */
socket.on('reactionUpdate', (data) => {
    const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
    if (!messageElement) return;

    // Get or create the reactions container
    const reactionsContainer = messageElement.querySelector('.reactions')
        || createReactionsContainer(messageElement);
    const emojiElement = reactionsContainer.querySelector(`[data-emoji-id="${data.emoji_id}"]`);

    if (data.count > 0) {
        if (emojiElement) {
            // Update existing reaction count
            emojiElement.querySelector('.count').textContent = data.count;
        } else {
            // Add new reaction element
            addEmojiReaction(reactionsContainer, data);
        }
    } else if (emojiElement) {
        // Remove reaction if count is zero
        emojiElement.remove();
    }
});

/* ===============================================
   Helper Function: createReactionsContainer(messageElement)
   - Creates and returns a container for reactions if one does not exist
=============================================== */
function createReactionsContainer(messageElement) {
    const container = document.createElement('div');
    container.className = 'reactions';
    messageElement.querySelector('.message-content').appendChild(container);
    return container;
}

/* ===============================================
   Helper Function: addEmojiReaction(container, data)
   - Adds a new emoji reaction element to the container
=============================================== */
function addEmojiReaction(container, data) {
    const emojiElement = document.createElement('span');
    emojiElement.className = 'emoji-reaction';
    emojiElement.dataset.emojiId = data.emoji_id;
    emojiElement.innerHTML = `
        <span class="emoji-character">${data.image}</span>            
        <span class="count">${data.count}</span>
    `;
    container.appendChild(emojiElement);
}

/* ===============================================
   Function: sendMessage()
   - Sends a new message via Socket.io to the current chat room
   - Clears the input field and updates the last read message status
=============================================== */
function sendMessage() {
    if (!currentChatId) return;
    const messageInput = document.getElementById('message');
    const msgText = messageInput.value.trim();
    if (!msgText) return;

    // Emit the message to the server via socket
    socket.emit('sendMessage', {
        room_id: currentChatId,
        text: msgText
    });

    // Update last read message status after sending
    const messages = document.querySelectorAll('.my-message, .other-message');
    if (messages.length > 0) {
        updateLastRead();
    }
    messageInput.value = '';
}
window.sendMessage = sendMessage;
/* ===============================================
   Function: updateLastRead()
   - Sends a request to the server to update the last read message for the chat
=============================================== */
function updateLastRead() {
    const messages = document.querySelectorAll('.my-message, .other-message');
    if (messages.length === 0) return;

    const lastMessageId = messages[messages.length - 1].dataset.messageId;
    fetch('/updateLastRead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            room_id: currentChatId,
            last_message_id: lastMessageId
        })
    });
}

/* ===============================================
   Modal Logic for Creating a New Chat
   - Opens the modal to compose a new chat
   - Toggles visibility of group name input based on user selection
   - Sends a request to create a new chat room
=============================================== */

// Open the "Create Chat" modal and hide the chat list
document.getElementById("composeButton").addEventListener("click", () => {
    document.getElementById("createChatModal").style.display = "flex";
    document.querySelector('.chat-list').style.display = 'none';
});

// For mobile: Go back to the chat list view
function goBackToList() {
    if (window.innerWidth <= 768) {
        document.querySelector('.chat-list').style.display = 'block';
    }
    document.querySelector('.chat-window').classList.remove('active');
    currentChatId = null;
    document.getElementById('chat-messages').innerHTML = '';
}
window.goBackToList = goBackToList;

// Close the chat creation modal and show chat list again
function closeModal() {
    document.getElementById("createChatModal").style.display = "none";
    document.querySelector('.chat-list').style.display = 'block';
}
window.closeModal = closeModal;

// Toggle display of the group name input based on how many users are selected
function toggleGroupName() {
    const checkboxes = document.querySelectorAll(".user-checkbox:checked");
    const groupNameSection = document.getElementById("groupNameSection");
    if (checkboxes.length > 1) {
        groupNameSection.style.display = "block";
    } else {
        groupNameSection.style.display = "none";
    }
}
window.toggleGroupName = toggleGroupName;

/* ===============================================
   Function: createChat()
   - Gathers selected users and group name (if applicable)
   - Validates input and sends a request to create a new chat room
=============================================== */
function createChat() {
    const checkboxes = document.querySelectorAll(".user-checkbox:checked");
    const selectedUsers = Array.from(checkboxes).map(cb => cb.value);

    // Ensure at least one user is selected
    if (selectedUsers.length === 0) {
        alert("Please select at least one user.");
        return;
    }

    const groupNameInput = document.getElementById("chatNameInput");
    let chatName = groupNameInput.value.trim();

    // For one-to-one chats, ignore group name
    if (selectedUsers.length === 1) {
        chatName = "";
    } else {
        // For group chats, require a group name if not provided
        if (!chatName) {
            alert("Please enter a group name for 2 or more users.");
            return;
        }
    }

    // Build the request payload based on whether a group name exists
    const requestBody = chatName
        ? { room_name: chatName, user_ids: selectedUsers }
        : { user_ids: selectedUsers };

    console.log("Creating chat:", requestBody);

    // Send request to create the new chat room
    fetch("/createRoom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
    .then(data => {
        console.log("Server response:", data);
        if (data.success) {
            alert("Chat created successfully!");
            location.reload();
        } else {
            alert("Error creating chat: " + data.message);
        }
    })
    .catch(error => console.error("Error:", error));
}
window.createChat = createChat;
});