require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

console.log("Supabase URL:", process.env.SUPABASE_URL);
console.log("Supabase Key:", process.env.SUPABASE_KEY ? "Loaded" : "Missing");

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

const crypto = require("crypto");

function generateEditKey() {
    return crypto.randomBytes(16).toString("hex");
}

// Home
app.get("/", async (req, res) => {

    const { data: pastes, error } = await supabase
        .from("pastes")
        .select("*")
        .order("created", { ascending: false });

    if (error) {
        console.log(error);
        return res.status(500).send("Failed to load pastes");
    }

    res.render("index", {
        pastes
    });

});

// Create Page
app.get("/create", (req, res) => {
    res.render("create");
});

// Create Paste
app.post("/create", async (req, res) => {

    const id = nanoid(8);

    const pasteData = {
        id,
        title: req.body.title || "Untitled",
        content: req.body.content,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        views: 0,
        editKey: generateEditKey(),
        history: [
            {
                title: req.body.title || "Untitled",
                content: req.body.content,
                editedAt: new Date().toISOString()
            }
        ]
    };

    const { error } = await supabase
        .from("pastes")
        .insert(pasteData);

    if (error) {
        console.log("SUPABASE INSERT ERROR:", error);
        return res.status(500).send(error.message);
    }

    res.redirect("/paste/" + id);

});

// View Paste
app.get("/paste/:id", async (req, res) => {

    const { data: paste, error } = await supabase
    .from("pastes")
    .select("*")
    .eq("id", req.params.id)
    .single();

if (error || !paste) {
    return res.status(404).send("Paste not found");
}

paste.views++;

await supabase
    .from("pastes")
    .update({ views: paste.views })
    .eq("id", paste.id);
    
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

<p>👁️ Views: ${paste.views}</p>

<p>📅 Created: ${new Date(paste.created).toLocaleString()}</p>

<p>✏️ Last Edited: ${new Date(paste.updated).toLocaleString()}</p>

<textarea readonly>${paste.content}</textarea>

<br><br>

<a href="/raw/${paste.id}">
<button>View RAW</button>
</a>

<br><br>

<a href="/edit/${paste.id}?key=${paste.editKey}">
<button>✏️ Edit Paste</button>
</a>

<br><br>

<form method="POST" action="/delete/${paste.id}?key=${paste.editKey}"
onsubmit="return confirm('Delete this paste?');">

<button style="background:red;color:white;">
🗑️ Delete Paste
</button>

</form>

</div>

</body>

</html>
    `);

});

// Raw
app.get("/raw/:id", async (req, res) => {

    const { data: paste, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("id", req.params.id)
        .single();

    if (error || !paste) {
        return res.status(404).send("Paste not found");
    }

    res.type("text/plain");
    res.send(paste.content);

});


// Edit Page
app.get("/edit/:id", async (req, res) => {

    const { data: paste, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("id", req.params.id)
        .single();

    if (error || !paste) {
        return res.status(404).send("Paste not found");
    }

    if (req.query.key !== paste.editKey) {
        return res.status(403).send("Invalid edit key");
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Edit Paste</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>

<div class="container">

<h1>Edit Paste</h1>

<form method="POST" action="/edit/${paste.id}?key=${paste.editKey}">

<input
type="text"
name="title"
value="${paste.title}"
placeholder="Title"
>

<textarea
name="content"
rows="15"
>${paste.content}</textarea>

<br><br>

<button type="submit">💾 Save Changes</button>

</form>

</div>

</body>
</html>
    `);

});

// Save Edit
app.post("/edit/:id", async (req, res) => {

    const { data: paste, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("id", req.params.id)
        .single();

    if (error || !paste) {
        return res.status(404).send("Paste not found");
    }

    if (req.query.key !== paste.editKey) {
        return res.status(403).send("Invalid edit key");
    }

    paste.history.push({
        title: paste.title,
        content: paste.content,
        editedAt: new Date().toISOString()
    });

    paste.title = req.body.title || "Untitled";
paste.content = req.body.content;
paste.updated = new Date().toISOString();

const { error: updateError } = await supabase
    .from("pastes")
    .update({
        title: paste.title,
        content: paste.content,
        updated: paste.updated,
        history: paste.history
    })
    .eq("id", paste.id);

if (updateError) {
    console.log(updateError);
    return res.status(500).send("Failed to update paste");
}

res.redirect("/paste/" + paste.id);

});

app.get("/test-supabase", async (req, res) => {

    const { data, error } = await supabase
        .from("pastes")
        .select("*");

    if (error) {
        return res.send(error.message);
    }

    res.json(data);

});

// Delete Paste
app.post("/delete/:id", async (req, res) => {

    const { data: paste, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("id", req.params.id)
        .single();

    if (error || !paste) {
        return res.status(404).send("Paste not found");
    }

    if (req.query.key !== paste.editKey) {
        return res.status(403).send("Invalid edit key");
    }

    const { error: deleteError } = await supabase
        .from("pastes")
        .delete()
        .eq("id", paste.id);

    if (deleteError) {
        console.log(deleteError);
        return res.status(500).send("Failed to delete paste");
    }

    res.redirect("/");
});

// 404 (PINAKA LAST)
app.use((req, res) => {
    res.status(404).send("404 Not Found");
});


app.listen(PORT, () => {
    console.log(`PasteHub running on port ${PORT}`);
});
