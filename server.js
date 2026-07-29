const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send(`
        <h1>🚀 PasteHub</h1>
        <p>Welcome to PasteHub!</p>
        <hr>
        <p>Project is working successfully.</p>
    `);
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
