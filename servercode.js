const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Initialize Gemini API
const genAI = new GoogleGenerativeAI('AIzaSyB-O_cLdk9-Xm80N3P2B1Byl5JDa4lEKRs');

// Add global menu variable
let globalMenuContent = null;

// Modify fetchMenuFromGoogleSheets to store in global variable
async function fetchMenuFromGoogleSheets() {
    console.log('**************Fetching menu from Google Sheets**************');
    try {
        const spreadsheetId = '1Q8Fy3ybQD69e7tIa0Q1P8wVkG8JrM4N-KWjB0fWDh4E';
        //const url = 'https://docs.google.com/spreadsheets/d/1EpJYetw5SORLJYsBbLzNPibfn_WLEgGD2F351q6hVrQ/edit?usp=sharing';
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
        
        const response = await axios.get(url);
        globalMenuContent = response.data;
        console.log('Menu data updated', response.data);
        return response.data;
    } catch (error) {
        console.error('Error fetching menu:', error);
        throw error;
    }
}

// Add new endpoint for menu updates
app.get('/update-menu', async (req, res) => {
    try {
        await fetchMenuFromGoogleSheets();
        res.json({ message: 'Menu updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update menu' });
    }
});

// Serve index.html
app.get('/', (req, res) => {
    console.log('Serving index.html');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Store chat history in memory
let chatHistory = [];

app.post('/continue-chat', async (req, res) => {
    try {
        console.log('Received request to continue chat');
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'No prompt provided' });
        }

        // Fetch menu only if not already loaded
        if (!globalMenuContent) {
            await fetchMenuFromGoogleSheets();
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
            systemInstruction: `You are a very helpful waiter at a restaurant. 
                              For each response, you should also suggest 3 relevant follow-up questions 
                              that the user might want to ask next. Format your response as JSON with 
                              'answer' and 'followUpQuestions' fields.`
        });

        // Create a chat instance
        const chat = model.startChat();

        // Use globalMenuContent instead of fetching
        let messageText;
        if (chatHistory.length === 0) {
            messageText = `You are a helpful AI assistant helping a user choose dishes from a restaurant menu provided below. 
                         Here is the menu, which is in csv format with each row representing a dish/item 
                         and each column representing a property of the dish/item.
                         
                         ${globalMenuContent}
                         
                         Please provide your response in JSON format with two fields:
                         1. 'answer': Your detailed response to the user's question
                         2. 'followUpQuestions': Array of 3 contextually relevant follow-up questions that the user might ask next. 
                         Make sure the follow-up questions are actually short and coscise that the user is likel;y to ask next. 
                         Phrase them as if the user is asking them. e.g: vegeterain options, options with less calories, etc.
                         Do NOT phrase the follow-up questions as if the waiter is asking them.
                         
                         To answer the following question, use the menu provided. Try to be as accurate as possible with respect to the menu.

                         User's question: ${prompt}`;
        } else {
            messageText = `Here is the menu:
                         
                         ${globalMenuContent}
                         
                         Previous conversation:
                         ${chatHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.parts}`).join('\n')}
                         
                         Please provide your response in JSON format with two fields:
                         1. 'answer': Your detailed response to the user's question
                         2. 'followUpQuestions': Array of 3 contextually relevant follow-up questions that the user might ask next. 
                         Make sure the follow-up questions are actually short and coscise that the user is likel;y to ask next. 
                         Phrase them as if the user is asking them. e.g: vegeterain options, options with less calories, etc.
                         Do NOT phrase the follow-up questions as if the waiter is asking them.


                         To answer the following question, use the menu provided. Try to be as accurate as possible with respect to the menu.

                         User's new question: ${prompt}`;
        }

        const result = await chat.sendMessage([{ text: messageText }]);
        let responseText = await result.response.text();

        // Remove ```json prefix and ``` suffix from the response
        responseText = responseText.slice(7, responseText.length - 4);

        console.log('Gemini Response:', responseText);

        // Parse the JSON response
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(responseText);
        } catch (error) {
            console.error('Error parsing JSON response:', error);
            // Fallback to regular response if JSON parsing fails
            parsedResponse = {
                answer: responseText,
                followUpQuestions: []
            };
        }

        // Update chat history with just the answer portion
        chatHistory.push({ role: "user", parts: prompt });
        chatHistory.push({ role: "model", parts: parsedResponse.answer });

        // Send both answer and follow-up questions to client
        res.json({
            response: parsedResponse.answer,
            followUpQuestions: parsedResponse.followUpQuestions
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: process.env.NODE_ENV === 'development' 
                ? `Error: ${error.message}` 
                : 'An error occurred while processing your request' 
        });
    }
});

// Modify clear-chat endpoint to optionally clear menu
app.post('/clear-chat', (req, res) => {
    chatHistory = [];
    if (req.body.clearMenu) {
        globalMenuContent = null;
    }
    res.json({ message: 'Chat history cleared' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});




// // Endpoint to fetch historical data
// app.get('/historical-data', async (req, res) => {
//     try {
//         const { startDate, endDate } = req.query;
//         if (!startDate || !endDate) {
//             return res.status(400).json({ error: 'Start date and end date are required' });
//         }

//         // Assuming you have a function to fetch historical data
//         const historicalData = await fetchHistoricalData(startDate, endDate);
//         if (!historicalData) {
//             return res.status(404).json({ error: 'No historical data found for the given date range' });
//         }

//         res.json(historicalData);
//     } catch (error) {
//         console.error('Error fetching historical data:', error);
//         res.status(500).json({ error: 'Failed to fetch historical data' });
//     }
// });

// // Dummy function to simulate fetching historical data
// async function fetchHistoricalData(startDate, endDate) {
//     // Replace with actual logic to fetch data from your data source
//     return [
//         { date: '2023-01-01', value: 100 },
//         { date: '2023-02-01', value: 150 },
//         // Add more data points as needed
//     ];
// }
