// Run `npm run dev` in one terminal, then `node test-ownership.mjs` in another.
// Fails loudly if a note route ever loses its userId check.
import assert from "node:assert/strict";

const base = process.env.BASE_URL ?? "http://localhost:4321";

async function signUp() {
    const email = `test-${crypto.randomUUID()}@example.com`;
    const res = await fetch(`${base}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {"Content-Type": "application/json", origin: base},
        body: JSON.stringify({name: "Test", email, password: "password123"}),
    });
    assert.equal(res.status, 200, `sign-up failed: ${await res.text()}`);
    const cookie = res.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    return {email, cookie};
}

function as(cookie) {
    return (path, init = {}) => fetch(base + path, {
        ...init,
        headers: {"Content-Type": "application/json", origin: base, cookie, ...init.headers},
    });
}

const alice = as((await signUp()).cookie);
const bob = as((await signUp()).cookie);
const anon = as("");

// Alice writes a note.
const created = await alice("/api/notes", {method: "POST", body: JSON.stringify({text: "Alice's secret"})});
assert.equal(created.status, 201);
const note = await created.json();

// Bob must not see or touch it.
assert.equal((await bob(`/api/notes/${note.id}`)).status, 404, "Bob could read Alice's note");
assert.equal(
    (await bob(`/api/notes/${note.id}`, {method: "PATCH", body: JSON.stringify({text: "hacked"})})).status,
    404, "Bob could edit Alice's note",
);
assert.equal((await bob(`/api/notes/${note.id}`, {method: "DELETE"})).status, 404, "Bob could delete Alice's note");
assert.ok(!(await (await bob("/api/notes")).json()).some(n => n.id === note.id), "Alice's note leaked into Bob's list");

// Bob must not read a file under Alice's prefix.
const aliceUserId = note.userId;
assert.equal(
    (await bob(`/api/uploads/${aliceUserId}/anything.png`)).status,
    403, "Bob could read Alice's file",
);

// Nobody can pin someone else's file onto their own note.
assert.equal(
    (await bob("/api/notes", {method: "POST", body: JSON.stringify({text: "mine", attachmentKey: aliceUserId + "/x.png"})})).status,
    403, "Bob could attach Alice's file on create",
);
const bobNote = await (await bob("/api/notes", {method: "POST", body: JSON.stringify({text: "mine"})})).json();
assert.equal(
    (await bob(`/api/notes/${bobNote.id}`, {method: "PATCH", body: JSON.stringify({attachmentKey: aliceUserId + "/x.png"})})).status,
    403, "Bob could attach Alice's file on edit",
);

// Logged out gets nothing.
assert.equal((await anon("/api/notes")).status, 401);
assert.equal((await anon(`/api/notes/${note.id}`)).status, 401);
assert.equal((await anon(`/api/notes/${note.id}`, {method: "DELETE"})).status, 401);

// Alice still owns her own note, end to end.
assert.equal((await alice(`/api/notes/${note.id}`)).status, 200);
const patched = await alice(`/api/notes/${note.id}`, {method: "PATCH", body: JSON.stringify({text: "edited"})});
assert.equal(patched.status, 200);
assert.equal((await patched.json()).body, "edited");
assert.equal((await alice(`/api/notes/${note.id}`, {method: "DELETE"})).status, 200);
assert.equal((await alice(`/api/notes/${note.id}`)).status, 404, "note survived its own delete");

// Empty notes are rejected.
assert.equal((await alice("/api/notes", {method: "POST", body: JSON.stringify({text: "  "})})).status, 400);

// Uploads go through the Worker now, so this is the whole round trip.
const up = await alice("/api/uploads?filename=hello.txt", {
    method: "POST", headers: {"Content-Type": "text/plain"}, body: "hello r2",
});
const uploaded = await up.json();
assert.equal(up.status, 201, `upload failed: ${JSON.stringify(uploaded)}`);
const {key} = uploaded;

const back = await alice(`/api/uploads/${key}`);
assert.equal(back.status, 200);
assert.equal(await back.text(), "hello r2", "file did not come back");
assert.equal((await anon(`/api/uploads/${key}`)).status, 401, "logged out could read a file");
assert.equal((await bob(`/api/uploads/${key}`)).status, 403, "Bob could read Alice's upload");

// A note carrying a file deletes cleanly, and takes the file with it.
const withFile = await (await alice("/api/notes", {method: "POST", body: JSON.stringify({text: "has a file", attachmentKey: key})})).json();
assert.equal((await alice(`/api/notes/${withFile.id}`, {method: "DELETE"})).status, 200);
assert.equal((await alice(`/api/uploads/${key}`)).status, 404, "R2 object outlived its note");

// Filename is required, and oversized uploads are turned away.
assert.equal((await alice("/api/uploads", {method: "POST", body: "x"})).status, 400);
assert.equal(
    (await alice("/api/uploads?filename=big.bin", {method: "POST", body: "x".repeat(26 * 1024 * 1024)})).status,
    413, "a 26MB upload got through",
);

console.log("ownership checks passed");
