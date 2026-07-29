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

app.get("/", (req, res) => {
    res.render("index");
    
        <h1>PasteHub</h1>

        <form method="POST" action="/create">

            <input
                name="title"
                placeholder="Title"
            />

            <br><br>

            <textarea
                name="content"
                rows="15"
                cols="80"
                placeholder="Write here..."
            ></textarea>

            <br><br>

            <button>Create Paste</button>

        </form>
    `);
});

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

app.get("/paste/:id", (req, res) => {

    const pastes = loadPastes();

    const paste = pastes.find(x => x.id === req.params.id);

    if (!paste)
        return res.status(404).send("Paste not found");

    res.send(`
        <h1>${paste.title}</h1>

        <pre>${paste.content}</pre>

        <hr>

        <a href="/raw/${paste.id}">
            RAW
        </a>
    `);

});

app.get("/raw/:id", (req, res) => {

    const pastes = loadPastes();

    const paste = pastes.find(x => x.id === req.params.id);

    if (!paste)
        return res.status(404).send("Paste not found");

    res.type("text/plain");
    res.send(paste.content);

});

app.listen(PORT, () => {
    console.log("PasteHub running on port " + PORT);
});
