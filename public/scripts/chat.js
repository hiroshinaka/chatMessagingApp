document.addEventListener('DOMContentLoaded', function() {
    // Initialize socket connection for real-time messaging
    const socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
      });
    let currentChatId = null;
    let isGroupChat = false;
    const username = window.username;
    const storedChatId = localStorage.getItem('currentChatId');
    const storedChatType = localStorage.getItem('currentChatType');
    function init() {
        if (storedChatId && storedChatType) {
            openChat(storedChatId, storedChatType);
            localStorage.removeItem('currentChatId');
            localStorage.removeItem('currentChatType');
        }
    }

/* ===============================================
   Function: openChat(chatId, chatType)
   - Loads messages for the selected chat
   - Handles mobile view by toggling visibility of chat list
   - Fetches messages from server and updates UI
   - If a group chat, fetches and displays group member info
=============================================== */
async function openChat(chatId, chatType) {
    try {
        console.log("Opening chat:", chatId, chatType);
        localStorage.setItem('currentChatId', chatId);
        localStorage.setItem('currentChatType', chatType);

        // Validate parameters
        if (!chatId?.trim()) {
            throw new Error("Invalid chat parameters");
        }

        // Mobile view handling
        if (window.innerWidth <= 768) {
            document.querySelector('.chat-window').classList.add('active');
            document.querySelector('.chat-list').style.display = 'none';
        }

        // Set chat state
        isGroupChat = (chatType === 'group');
        currentChatId = chatId;
        const chatWindow = document.querySelector('.chat-window');
        chatWindow.setAttribute('data-room-id', chatId);
        chatWindow.setAttribute('data-chat-type', chatType);

        // Join the socket.io room for real-time updates
        socket.emit('joinRoom', { room_id: chatId });

        // Fetch messages with error handling
        const response = await fetch(`/getMessages?chatId=${chatId}&isGroup=${isGroupChat}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        console.log("Messages response:", data);

        if (!data.messages || !Array.isArray(data.messages)) {
            throw new Error("Invalid messages format");
        }

        // Update UI: display messages
        const messagesDiv = document.getElementById("chat-messages");
        messagesDiv.innerHTML = "";
        data.messages.forEach(displayMessage);
        
        // Add scroll listener for read detection
        messagesDiv.addEventListener('scroll', handleScrollForReadStatus);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // If group chat, fetch group members and update member list
        if (isGroupChat) {
            const groupResponse = await fetch(`/getGroupMembers?groupId=${chatId}`);
            if (!groupResponse.ok) throw new Error(`Group members fetch failed: ${groupResponse.status}`);
            const groupData = await groupResponse.json();
            window.currentChatMembers = groupData.members;

            // Show/hide invite button based on member count
            const inviteButton = document.getElementById('invite-button');
            inviteButton.style.display = groupData.members.length >= 3 ? 'block' : 'none';

            // Update the group members list
            const membersList = document.getElementById('group-members-list');
            membersList.innerHTML = "";
            groupData.members.forEach(member => {
                const li = document.createElement('li');
                li.innerHTML = `<img src="${member.profile_img || '/default-avatar.png'}" class="small-avatar">
                                <span>${member.username}</span>`;
                membersList.appendChild(li);
            });
        }
        const chatHeaderDesktop = document.getElementById('chat-username-desktop');
        const chatHeaderMobile = document.getElementById('chat-username-mobile');        
  
        const currentChat = chatListData.find(c => 
            Number(c.room_id) === Number(chatId)
        );     
        if (currentChat) {
            const newName = currentChat.chat_name || "New Chat";
            if (chatHeaderDesktop) {
              chatHeaderDesktop.textContent = newName;
            }
            if (chatHeaderMobile) {
              chatHeaderMobile.textContent = newName;
            }
        } else {
            if (chatHeaderDesktop) {
              chatHeaderDesktop.textContent = "Select a chat";
            }
            if (chatHeaderMobile) {
              chatHeaderMobile.textContent = "Select a chat";
            }
        }

        // Clear unread badges from the conversation list
        const chatItem = document.querySelector(`.chat-item[data-room-id="${chatId}"]`);
        if (chatItem) {
            chatItem.classList.remove('unread');
            const badge = chatItem.querySelector('.unread-badge');
            if (badge) badge.remove();
        }

    } catch (error) {
        console.error("Error in openChat:", error);
        alert("Failed to load chat. Please try again.");
        goBackToList();
    }
}

window.openChat = openChat;

function handleScrollForReadStatus() {
    const messagesDiv = document.getElementById("chat-messages");
    const { scrollTop, scrollHeight, clientHeight } = messagesDiv;
    const isAtBottom = scrollHeight - scrollTop === clientHeight;

    if (isAtBottom) {
        updateLastRead();
    }
}
/* ===============================================
   Socket.io Event Handling: receiveMessage
   - Listens for incoming messages
   - Updates the message display and handles unread notifications
=============================================== */
socket.on('receiveMessage', (msg) => {
    console.log('Received message:', msg);
    
    // Only display if it's for the current chat
    if (msg.room_id === currentChatId) {
        displayMessage(msg);
        updateLastRead();
        
        // Scroll to bottom
        const messagesDiv = document.getElementById("chat-messages");
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else {
        // Update unread count for other chats
        const chatItem = document.querySelector(`.chat-item[data-room-id="${msg.room_id}"]`);
        if (chatItem) {
            chatItem.classList.add('unread');
            let badge = chatItem.querySelector('.unread-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'unread-badge';
                badge.textContent = '1';
                chatItem.appendChild(badge);
            } else {
                badge.textContent = parseInt(badge.textContent) + 1;
            }
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
    const messageElement = document.createElement('div');
    
    messageElement.className = msg.sender === username ? "my-message" : "other-message";
    messageElement.dataset.messageId = msg.message_id;

    // Fix date formatting
    let timestamp;
    try {
        // Try parsing ISO string first
        timestamp = msg.sent_datetime ? new Date(msg.sent_datetime) : new Date();
        if (isNaN(timestamp.getTime())) {
            // Fallback to current time if invalid
            timestamp = new Date();
        }
    } catch (e) {
        timestamp = new Date();
    }

    messageElement.innerHTML = `
      <div class="message-content">
        <strong>${msg.sender}:</strong> ${msg.text}
        <div class="message-timestamp">${timestamp.toLocaleString()}</div>
      </div>
    `;
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    if (msg.is_unread) {
        const existingDivider = messagesDiv.querySelector('.unread-divider');
        if (!existingDivider) {
            const unreadDivider = document.createElement('div');
            unreadDivider.className = 'unread-divider';
            unreadDivider.innerHTML = `
                <div class="unread-line"></div>
                <span class="unread-text">New Messages</span>
                <div class="unread-line"></div>
            `;
            messagesDiv.insertBefore(unreadDivider, messageElement);
        }
    }

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
    try {
        // Get current chat state from UI
        const chatWindow = document.querySelector('.chat-window');
        const currentRoomId = chatWindow.getAttribute('data-room-id');
        const currentChatType = chatWindow.getAttribute('data-chat-type');

        // Save state before reacting
        localStorage.setItem('currentChatId', currentRoomId);
        localStorage.setItem('currentChatType', currentChatType);

        fetch('/react', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message_id: messageId, emoji_id: emojiId })
        })
        .then(() => {
            // Reload after short delay to ensure state is saved
            setTimeout(() => location.reload(), 300);
        })
        .catch(console.error);
    } catch (error) {
        console.error("Error in sendReaction:", error);
    }
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
    const messageInput = document.getElementById('message');
    const text = messageInput.value.trim();
    
    if (!text || !currentChatId) return;
  
    // Emit to server
    socket.emit('sendMessage', {
      room_id: currentChatId,
      text: text
    });
  
    // Clear input but DON'T reload - let Socket.io handle the update
    messageInput.value = '';
  }

// Initialize the chat after DOM loads
init();
window.sendMessage = sendMessage;
/* ===============================================
   Function: updateLastRead()
   - Sends a request to the server to update the last read message for the chat
=============================================== */
function updateLastRead() {
    document.querySelectorAll('.unread-divider').forEach(div => {
        div.classList.add('hidden');
        setTimeout(() => div.remove(), 10000);
    });

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

function openInviteModal() {
    console.log('Opening invite modal...');
    // Create the modal if it doesn't already exist
    let modal = document.getElementById('inviteModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'inviteModal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Invite Members</h2>
                <ul id="inviteUserList"></ul>
                <button id="sendInviteButton">Invite</button>
                <button id="closeInviteModalButton">Cancel</button>
            </div>
        `;
        document.body.appendChild(modal);
        // Attach event listeners to modal buttons
        document.getElementById('sendInviteButton').addEventListener('click', sendInvites);
        document.getElementById('closeInviteModalButton').addEventListener('click', closeInviteModal);
    }

    // Clear any existing list items
    const inviteUserList = document.getElementById('inviteUserList');
    inviteUserList.innerHTML = '';

    // Filter out users already in the group from the full user list
    // allUsersData is passed from the server in chat.ejs
    const currentMembers = window.currentChatMembers || [];
    const potentialInvitees = allUsersData.filter(user => {
        return !currentMembers.some(member => member.user_id === user.user_id);
    });

    // Populate the modal with checkboxes for potential invitees
    potentialInvitees.forEach(user => {
        const li = document.createElement('li');
        li.innerHTML = `<label>
            <input type="checkbox" class="invite-checkbox" value="${user.user_id}">
            ${user.username}
        </label>`;
        inviteUserList.appendChild(li);
    });

    // Show the modal
    modal.style.display = 'flex';
}

function closeInviteModal() {
    const modal = document.getElementById('inviteModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function sendInvites() {
    const checkboxes = document.querySelectorAll('.invite-checkbox:checked');
    const selectedUserIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (!selectedUserIds.length) {
        alert('Please select users to invite');
        return;
    }

    try {
        const roomId = currentChatId;
        console.log('Sending invites for room:', roomId, 'to users:', selectedUserIds);

        // Send all invites in parallel
        const responses = await Promise.all(
            selectedUserIds.map(userId => 
                fetch(`/rooms/${roomId}/invite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId })
                })
            )
        );

        // Check for HTTP errors
        const errors = responses.filter(r => !r.ok);
        if (errors.length > 0) {
            throw new Error(`HTTP errors: ${errors.map(e => e.status).join(', ')}`);
        }

        // Parse all responses
        const results = await Promise.all(responses.map(r => r.json()));
        
        // Check for application errors
        const failedInvites = results.filter(r => !r.success);
        if (failedInvites.length > 0) {
            throw new Error(failedInvites.map(f => f.message).join('\n'));
        }

        // Refresh members list
        console.log('Refreshing group members...');
        const groupResponse = await fetch(`/getGroupMembers?groupId=${roomId}`);
        if (!groupResponse.ok) throw new Error('Failed to refresh members');
        
        const groupData = await groupResponse.json();
        renderGroupMembers(groupData.members);
        
        alert('Successfully invited users!');
    } catch (error) {
        console.error('Invite error:', error);
        alert(`Invitation failed: ${error.message}`);
    } finally {
        closeInviteModal();
    }
}

function renderGroupMembers(members) {
    const membersList = document.getElementById('group-members-list');
    membersList.innerHTML = '';
    members.forEach(member => {
        membersList.innerHTML += `
            <li>
                <img src="${member.profile_img || '/default-avatar.png'}" 
                     class="small-avatar">
                <span>${member.username}</span>
            </li>
        `;
    });
}

document.getElementById('message').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      sendMessage();      
    }
  });
window.openInviteModal = openInviteModal;
window.closeInviteModal = closeInviteModal;
window.sendInvites = sendInvites;
});
