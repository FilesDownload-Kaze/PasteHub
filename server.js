require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

console.log("Supabase URL:", process.env.SUPABASE_URL);
console.log(
    "Supabase Key:",
    process.env.SUPABASE_ANON_KEY ? "Loaded" : "Missing"
);

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || "pastehub-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));
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

function generateEditKey() {
    return crypto.randomBytes(16).toString("hex");
}


/* =========================================================
   HOME
========================================================= */


app.get("/", async (req, res) => {

    if (!req.session.user) {
        return res.redirect("/login");
    }

    const { data: pastes, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("userId", req.session.user.id)
        .order("created", { ascending: false });

    if (error) {
        console.log("HOME ERROR:", error);
        return res.status(500).send("Failed to load pastes");
    }

    const { data: folders, error: folderError } = await supabase
        .from("folders")
        .select("*")
        .eq("userId", req.session.user.id)
        .order("created", { ascending: true });

    if (folderError) {
        console.log("FOLDERS ERROR:", folderError);
        return res.status(500).send("Failed to load folders");
    }

    res.render("index", {
        pastes: pastes || [],
        folders: folders || []
    });
});



/* =========================================================
   ALL PASTES
========================================================= */

app.get("/all-pastes", async (req, res) => {

    // Check if user is logged in
    if (!req.session.user) {
        return res.redirect("/login");
    }

    const { data: pastes, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("userId", req.session.user.id)
        .order("created", { ascending: false });

    if (error) {
        console.log("ALL PASTES ERROR:", error);
        return res.status(500).send("Failed to load pastes");
    }

    res.render("all-pastes", {
        pastes: pastes || []
    });
});


/* =========================================================
   ADD FOLDER PAGE
========================================================= */

app.get("/folder/add", (req, res) => {

    res.send(`
<!DOCTYPE html>
<html>
<head>

<title>Add Folder - PasteHub</title>

<link rel="stylesheet" href="/style.css">

</head>

<body>

<div class="container">

<h1>📁 Create Folder</h1>

<form method="POST" action="/folder/add">

<input
    type="text"
    name="name"
    placeholder="Folder name"
    required
>

<br><br>

<button type="submit">
📁 Create Folder
</button>

<a href="/">
<button type="button">
Cancel
</button>
</a>

</form>

</div>

</body>
</html>
    `);
});


/* =========================================================
   ADD FOLDER SAVE
========================================================= */

app.post("/folder/add", async (req, res) => {

    const name = (req.body.name || "").trim();

    if (!name) {
        return res.status(400).send("Folder name is required");
    }

    /* Check duplicate folder */

    const { data: existing, error: checkError } = await supabase
        .from("folders")
        .select("id")
        .eq("userId", req.session.user.id)
        .eq("name", name)
        .limit(1);

    if (checkError) {
        console.log("FOLDER CHECK ERROR:", checkError);
        return res.status(500).send("Failed to check folder");
    }

    if (existing && existing.length > 0) {
        return res.status(400).send("A folder with that name already exists");
    }

    /* Create folder */

    const { error: insertError } = await supabase
        .from("folders")
        .insert({
           id: nanoid(8),
           userId: req.session.user.id,
           name: name,
           created: new Date().toISOString()
        });

    if (insertError) {
        console.log("FOLDER INSERT ERROR:", insertError);
        return res.status(500).send("Failed to create folder");
    }

    res.redirect("/");
});


/* =========================================================
   OPEN FOLDER
========================================================= */

app.get("/folder/:name", async (req, res) => {

    const folderName = decodeURIComponent(req.params.name);

    const { data: pastes, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("folder", folderName)
        .eq("userId", req.session.user.id)
        .order("created", { ascending: false });

    if (error) {
        console.log("FOLDER ERROR:", error);
        return res.status(500).send("Failed to load folder");
    }

    res.render("folder", {
        folder: folderName,
        pastes: pastes || []
    });
});


/* =========================================================
   RENAME FOLDER PAGE
========================================================= */

app.get("/folder/rename/:name", (req, res) => {

    const folderName = decodeURIComponent(req.params.name);

    res.send(`
<!DOCTYPE html>
<html>
<head>

<title>Rename Folder - PasteHub</title>

<link rel="stylesheet" href="/style.css">

</head>

<body>

<div class="container">

<h1>✏️ Rename Folder</h1>

<form method="POST" action="/folder/rename">

<input
    type="hidden"
    name="oldName"
    value="${folderName}"
>

<input
    type="text"
    name="newName"
    value="${folderName}"
    placeholder="New folder name"
    required
>

<br><br>

<button type="submit">
💾 Save Name
</button>

<a href="/">
<button type="button">
Cancel
</button>
</a>

</form>

</div>

</body>
</html>
    `);
});


/* =========================================================
   RENAME FOLDER SAVE
========================================================= */

app.post("/folder/rename", async (req, res) => {

    const oldName = (req.body.oldName || "").trim();
    const newName = (req.body.newName || "").trim();

    if (!oldName || !newName) {
        return res.status(400).send("Folder name is required");
    }

    if (oldName === newName) {
        return res.redirect("/");
    }

    /* Check if new folder already exists */

    const { data: existing, error: checkError } = await supabase
        .from("folders")
        .select("id")
        .eq("userId", req.session.user.id)
        .eq("name", newName)
        .limit(1);

    if (checkError) {
        console.log("FOLDER CHECK ERROR:", checkError);
        return res.status(500).send("Failed to check folder name");
    }

    if (existing && existing.length > 0) {
        return res.status(400).send("A folder with that name already exists");
    }

    /* Rename actual folder */

    const { error: folderUpdateError } = await supabase
        .from("folders")
        .update({
            name: newName
        })
        .eq("userId", req.session.user.id)
        .eq("name", oldName);

    if (folderUpdateError) {
        console.log("FOLDER RENAME ERROR:", folderUpdateError);
        return res.status(500).send("Failed to rename folder");
    }

    /* Update pastes inside that folder */

    const { error: pasteUpdateError } = await supabase
        .from("pastes")
        .update({
            folder: newName
        })
        .eq("folder", oldName);

    if (pasteUpdateError) {
        console.log("PASTE FOLDER UPDATE ERROR:", pasteUpdateError);
        return res.status(500).send(
            "Folder renamed but failed to update pastes"
        );
    }

    res.redirect("/");
});


/* =========================================================
   CREATE PAGE
========================================================= */

app.get("/create", async (req, res) => {

    const { data: folders, error } = await supabase
        .from("folders")
        .select("*")
        .eq("userId", req.session.user.id)
        .order("created", { ascending: true });
    
    if (error) {
        console.log("LOAD FOLDERS ERROR:", error);
        return res.status(500).send("Failed to load folders");
    }

    res.render("create", {
        folders: folders || [],
        selectedFolder: req.query.folder || ""
    });
});


/* =========================================================
   CREATE PASTE
========================================================= */

app.post("/create", async (req, res) => {

    const id = nanoid(8);
    const now = new Date().toISOString();

    const title = req.body.title || "Untitled";
    const content = req.body.content || "";

    let folder = (req.body.folder || "").trim();

    /*
        Empty folder = no folder
    */

    if (folder === "") {
        folder = null;
    } else {

        /*
            Make sure selected folder really exists
        */

        const { data: folderExists, error: folderCheckError } =
            await supabase
                .from("folders")
                .select("id")
                .eq("userId", req.session.user.id)
                .eq("name", folder)
                .limit(1);

        if (folderCheckError) {
            console.log("CREATE FOLDER CHECK ERROR:", folderCheckError);
            return res.status(500).send("Failed to check folder");
        }

        if (!folderExists || folderExists.length === 0) {
            return res.status(400).send("Selected folder does not exist");
        }
    }

    const pasteData = {
        id,
        userId: req.session.user.id,
        title,
        content,
        folder,
        created: now,
        updated: now,
        views: 0,
        editKey: generateEditKey(),

        history: [
            {
                title,
                content,
                editedAt: now
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


/* =========================================================
   VIEW PASTE
========================================================= */

app.get("/paste/:id", async (req, res) => {

    const { data: paste, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("userId", req.session.user.id)
        .eq("id", req.params.id)
        .single();

    if (error || !paste) {
        return res.status(404).send("Paste not found");
    }

    paste.views++;

    await supabase
        .from("pastes")
        .update({
            views: paste.views
        })
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

<p>
📁 Folder:
${paste.folder || "None"}
</p>

<p>
📅 Created:
${new Date(paste.created).toLocaleString()}
</p>

<p>
✏️ Last Edited:
${new Date(paste.updated).toLocaleString()}
</p>

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

<a href="/paste/move/${paste.id}">
<button>📁 Move Paste</button>
</a>

<br><br>

<form
method="POST"
action="/delete/${paste.id}?key=${paste.editKey}"
onsubmit="return confirm('Delete this paste?');"
>

<button style="background:red;color:white;">
🗑️ Delete Paste
</button>

</form>

<br>

<a href="/">
<button>← Back</button>
</a>

</div>

</body>
</html>
    `);
});


/* =========================================================
   RAW
========================================================= */

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


/* =========================================================
   DOWNLOAD REDIRECT
========================================================= */

app.get("/download/:id", async (req, res) => {

    const { data: paste, error } = await supabase
        .from("pastes")
        .select("content")
        .eq("userId", req.session.user.id)
        .eq("id", req.params.id)
        .single();

    if (error || !paste) {
        return res.status(404).send("Paste not found");
    }

    res.redirect(paste.content.trim());
});


/* =========================================================
   EDIT PAGE
========================================================= */

app.get("/edit/:id", async (req, res) => {

    const { data: paste, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("userId", req.session.user.id)
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

<h1>✏️ Edit Paste</h1>

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

<button type="submit">
💾 Save Changes
</button>

</form>

<br>

<a href="/paste/${paste.id}">
<button>Cancel</button>
</a>

</div>

</body>

</html>
    `);
});


/* =========================================================
   SAVE EDIT
========================================================= */

app.post("/edit/:id", async (req, res) => {

    const { data: paste, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("userId", req.session.user.id)
        .eq("id", req.params.id)
        .single();

    if (error || !paste) {
        return res.status(404).send("Paste not found");
    }

    if (req.query.key !== paste.editKey) {
        return res.status(403).send("Invalid edit key");
    }

    const history = Array.isArray(paste.history)
        ? paste.history
        : [];

    history.push({
        title: paste.title,
        content: paste.content,
        editedAt: new Date().toISOString()
    });

    const title = req.body.title || "Untitled";
    const content = req.body.content || "";
    const updated = new Date().toISOString();

    const { error: updateError } = await supabase
    .from("pastes")
    .update({
        title,
        content,
        updated,
        history
    })
    .eq("userId", req.session.user.id)
    .eq("id", paste.id);

    if (updateError) {
        console.log("EDIT ERROR:", updateError);
        return res.status(500).send("Failed to update paste");
    }

    res.redirect("/paste/" + paste.id);
});


/* =========================================================
   MOVE PASTE - PAGE
========================================================= */

app.get("/paste/move/:id", async (req, res) => {

    const { data: paste, error: pasteError } = await supabase
        .from("pastes")
        .select("*")
        .eq("userId", req.session.user.id)
        .eq("id", req.params.id)
        .single();

    if (pasteError || !paste) {
        return res.status(404).send("Paste not found");
    }

    /*
        IMPORTANT:
        Get folders from the folders table,
        NOT from pastes.
    */

    const { data: folders, error: folderError } = await supabase
         .from("folders")
         .select("*")
         .eq("userId", req.session.user.id)
         .order("created", { ascending: true });

    if (folderError) {
        console.log("MOVE FOLDER ERROR:", folderError);
        return res.status(500).send("Failed to load folders");
    }

    res.send(`
<!DOCTYPE html>
<html>

<head>

<title>Move Paste - PasteHub</title>

<link rel="stylesheet" href="/style.css">

</head>

<body>

<div class="container">

<h1>📁 Move Paste</h1>

<h2>${paste.title}</h2>

<p>
Current Folder:
<strong>${paste.folder || "None"}</strong>
</p>

<form method="POST" action="/paste/move/${paste.id}">

<label>
Select Folder:
</label>

<br><br>

<select name="folder">

<option value="">
None
</option>

${(folders || []).map(folder => `
<option
value="${folder.name}"
${paste.folder === folder.name ? "selected" : ""}
>
${folder.name}
</option>
`).join("")}

</select>

<br><br>

<button type="submit">
📁 Move Paste
</button>

</form>

<br>

<a href="/paste/${paste.id}">
<button>
← Back
</button>
</a>

</div>

</body>

</html>
    `);
});


/* =========================================================
   MOVE PASTE - SAVE
========================================================= */

app.post("/paste/move/:id", async (req, res) => {

    const folder = (req.body.folder || "").trim();

    const newFolder = folder === "" ? null : folder;

    /*
        If selecting a folder,
        make sure it exists.
    */

    if (newFolder !== null) {

        const { data: folderExists, error: folderError } =
            await supabase
                .from("folders")
                .select("id")
                .eq("userId", req.session.user.id)
                .eq("name", newFolder)
                .limit(1);

        if (folderError) {
            console.log("MOVE CHECK ERROR:", folderError);
            return res.status(500).send("Failed to check folder");
        }

        if (!folderExists || folderExists.length === 0) {
            return res.status(400).send("Folder does not exist");
        }
    }

    const { data: paste, error: pasteError } = await supabase
        .from("pastes")
        .select("id")
        .eq("userId", req.session.user.id)
        .eq("id", req.params.id)
        .single();

    if (pasteError || !paste) {
        return res.status(404).send("Paste not found");
    }

    const { error: updateError } = await supabase
        .from("pastes")
.update({
    folder: newFolder
})
.eq("userId", req.session.user.id)
.eq("id", req.params.id);

    if (updateError) {
        console.log("MOVE PASTE ERROR:", updateError);
        return res.status(500).send("Failed to move paste");
    }

    res.redirect("/");
});


/* =========================================================
   TEST SUPABASE
========================================================= */

app.get("/test-supabase", async (req, res) => {

    const { data, error } = await supabase
        .from("pastes")
        .eq("userId", req.session.user.id)
        .select("*");

    if (error) {
        return res.send(error.message);
    }

    res.json(data);
});


/* =========================================================
   DELETE PASTE
========================================================= */

app.post("/delete/:id", async (req, res) => {

    const { data: paste, error } = await supabase
        .from("pastes")
        .select("*")
        .eq("userId", req.session.user.id)
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
    .eq("userId", req.session.user.id)
    .eq("id", paste.id);

    if (deleteError) {
        console.log("DELETE ERROR:", deleteError);
        return res.status(500).send("Failed to delete paste");
    }

    res.redirect("/");
});

/* =========================================================
   REGISTER
========================================================= */

app.get("/register", (req, res) => {
    res.render("register");
});

/* =========================================================
   REGISTER 
========================================================= */

app.post("/register", async (req, res) => {

    const username = (req.body.username || "").trim();
    const password = req.body.password || "";

    if (!username || !password) {
        return res.status(400).send("Username and password are required");
    }

    const { data: existing, error: checkError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .limit(1);

    if (checkError) {
        console.log(checkError);
        return res.status(500).send("Database error");
    }

    if (existing.length > 0) {
        return res.status(400).send("Username already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { error: insertError } = await supabase
    .from("users")
    .insert({
        id: nanoid(8),
        username: username,
        password: hashedPassword
    });

    if (insertError) {
    console.log("REGISTER ERROR:", insertError);
    return res.status(500).send(insertError.message);
    }

    res.redirect("/login");
});


app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", async (req, res) => {

    const username = (req.body.username || "").trim();
    const password = req.body.password || "";

    const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .single();

    if (error || !user) {
        return res.status(400).send("Invalid username or password");
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
        return res.status(400).send("Invalid username or password");
    }

    req.session.user = {
        id: user.id,
        username: user.username
    };

    res.redirect("/");
});

/* =========================================================
   SETUP ADMIN (ONE TIME)
========================================================= */

app.get("/setup-admin", async (req, res) => {

    const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("username", "KAZEHAYAMODZ")
        .limit(1);

    if (existing && existing.length > 0) {
        return res.send("✅ Admin already exists.");
    }

    const hashedPassword = await bcrypt.hash("Kaze82809353", 10);

    const { error } = await supabase
        .from("users")
        .insert({
            id: nanoid(8),
            username: "KAZEHAYAMODZ",
            email: "kaze@pastehub.local",
            password: hashedPassword
        });

    if (error) {
        console.log(error);
        return res.send(error.message);
    }

    res.send("✅ Admin account created! Username: KAZEHAYAMODZ Password: Kaze82809353");
});

app.get("/debug-my-account", async (req, res) => {
    if (!req.session.user) {
        return res.send("Not logged in");
    }

    const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", req.session.user.id)
        .single();

    const { data: pastes, error: pasteError } = await supabase
        .from("pastes")
        .eq("userId", req.session.user.id)
        .select("id, title, userId, folder");

    const { data: folders, error: folderError } = await supabase
        .from("folders")
        .eq("userId", req.session.user.id)
        .select("id, name, userId");

    res.json({
        session: req.session.user,
        user,
        pastes,
        folders,
        errors: {
            userError,
            pasteError,
            folderError
        }
    });
});

app.get("/restore-admin-data", async (req, res) => {

    if (!req.session.user) {
        return res.status(401).send("Not logged in");
    }

    const userId = req.session.user.id;

    // Link old folders to the logged-in account
    const { error: folderError } = await supabase
        .from("folders")
        .eq("userId", req.session.user.id)
        .update({
            userId: userId
        })
        .is("userId", null);

    if (folderError) {
        console.log("RESTORE FOLDERS ERROR:", folderError);
        return res.status(500).send(folderError.message);
    }

    // Link old pastes to the logged-in account
    const { error: pasteError } = await supabase
        .from("pastes")
        .eq("userId", req.session.user.id)
        .update({
            userId: userId
        })
        .is("userId", null);

    if (pasteError) {
        console.log("RESTORE PASTES ERROR:", pasteError);
        return res.status(500).send(pasteError.message);
    }

    res.send(`
        <h2>✅ Restore complete!</h2>
        <p>Folders and pastes with NULL userId were linked to:</p>
        <p><strong>${req.session.user.username}</strong></p>
        <p>User ID: ${userId}</p>
        <br>
        <a href="/">Go to PasteHub</a>
    `);
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

/* =========================================================
   404
========================================================= */

app.use((req, res) => {
    res.status(404).send("404 Not Found");
});


/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
    console.log(`PasteHub running on port ${PORT}`);
});
