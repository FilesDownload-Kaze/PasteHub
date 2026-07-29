const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static("public"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const DB = "./pastes.json";

function loadPastes() {
    if (!fs.existsSync(DB)) {
        fs.writeFileSync(DB, "[]");
    }

    return JSON.parse(fs.readFileSync(DB, "utf8"));
}

function savePastes(data) {
    fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

// Home
app.get("/", (req, res) => {
    res.render("index");
});

// Create Paste
app.post("/create", (req, res) => {

    const pastes = loadPastes();

    const id = nanoid(8);

    pastes.push({
        id,
        title: req.body.title || "Untitled",
        content: req.body.content,
        created: new Date().toISOString()
    });

    savePastes(pastes);

    res.redirect("/paste/" + id);

});

// View Paste
app.get("/paste/:id", (req, res) => {

    const pastes = loadPastes();

    const paste = pastes.find(p => p.id === req.params.id);

    if (!paste) {
        return res.status(404).send("Paste not found");
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>${paste.title}</title>

<link rel="stylesheet" href="/style.css">

</head>

<body>

<div class="container">

<h1>${paste.title}</h1>

<textarea readonly>${paste.content}</textarea>

<br><br>

<a href="/raw/${paste.id}">
<button>View RAW</button>
</a>

</div>

</body>

</html>
    `);

});

// Raw
app.get("/raw/:id", (req, res) => {

    const pastes = loadPastes();

    const paste = pastes.find(p => p.id === req.params.id);

    if (!paste) {
        return res.status(404).send("Paste not found");
    }

    res.type("text/plain");
    res.send(paste.content);

});

// 404
app.use((req, res) => {
    res.status(404).send("404 Not Found");
});

app.listen(PORT, () => {
    console.log(`PasteHub running on port ${PORT}`);
});
