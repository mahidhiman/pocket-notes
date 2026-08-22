// Flesch-Kincaid grade level for the manuscript prose.
// Usage: node book/readability.mjs [path-to-markdown]
//
// Code is not English, so fenced blocks, inline code, tables, and URLs
// are stripped before scoring. Whatever is left is what a reader reads.
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";

const file = process.argv[2] ?? "Build Your Own SaaS - Complete Manuscript.md";

export function stripNonProse(md) {
    return md
        .replace(/```[\s\S]*?```/g, " ")     // fenced code blocks
        .replace(/^\s*\|.*\|\s*$/gm, " ")    // table rows
        .replace(/`[^`\n]*`/g, " ")          // inline code
        .replace(/https?:\/\/\S+/g, " ")     // bare URLs
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^\s{0,3}#{1,6}\s+/gm, " ") // heading marks, keep the words
        .replace(/^\s*>\s?/gm, "")           // callout markers, keep the text
        .replace(/[*_]{1,3}/g, "");
}

// Vowel groups, minus a silent trailing "e". Rough, and the standard
// approximation every readability tool uses.
export function syllables(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (w.length <= 3) return w.length ? 1 : 0;
    const groups = w
        .replace(/e\b/, "")
        .match(/[aeiouy]+/g);
    return Math.max(1, groups ? groups.length : 1);
}

export function score(prose) {
    const sentences = prose
        .split(/[.!?]+[\s"')\]]|\n\s*\n/)
        .map(s => s.trim())
        .filter(s => /[a-z]/i.test(s));

    const words = prose.match(/\b[A-Za-z][A-Za-z'-]*\b/g) ?? [];
    if (!sentences.length || !words.length) return null;

    const syls = words.reduce((n, w) => n + syllables(w), 0);
    const wordsPerSentence = words.length / sentences.length;
    const syllablesPerWord = syls / words.length;

    return {
        words: words.length,
        sentences: sentences.length,
        wordsPerSentence,
        syllablesPerWord,
        grade: 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59,
        ease: 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord,
    };
}

function demo() {
    // "The cat sat on the mat." should land in early primary school.
    const easy = score("The cat sat on the mat. The dog ran to the man. It was fun.");
    assert.ok(easy.grade < 3, `easy text scored ${easy.grade}`);

    // A long sentence of long words must score much higher.
    const hard = score(
        "Authorization misconfiguration inevitably precipitates catastrophic " +
        "informational disclosure whenever authentication verification " +
        "responsibilities remain inadequately delineated throughout " +
        "distributed infrastructure implementations.",
    );
    assert.ok(hard.grade > easy.grade + 8, `hard text scored ${hard.grade}`);

    // Code must not reach the scorer.
    assert.equal(stripNonProse("Hi.\n\n```ts\nconst x = 1;\n```\n").includes("const"), false);
    console.log("readability self-check passed");
}

if (process.argv.includes("--self-check")) {
    demo();
} else {
    const md = readFileSync(file, "utf8");

    const chapters = md
        .split(/^# /m)
        .slice(1)
        .map(part => ({
            title: part.split("\n")[0].trim(),
            result: score(stripNonProse(part)),
        }))
        .filter(c => c.result);

    const whole = score(stripNonProse(md));

    console.log(`\n  ${file}\n`);
    console.log(`  Whole book`);
    console.log(`    Flesch-Kincaid grade : ${whole.grade.toFixed(1)}`);
    console.log(`    Reading ease         : ${whole.ease.toFixed(0)} (higher is easier)`);
    console.log(`    Words                : ${whole.words.toLocaleString()}`);
    console.log(`    Words per sentence   : ${whole.wordsPerSentence.toFixed(1)}`);
    console.log(`\n  Per chapter (grade level)\n`);

    for (const {title, result} of chapters) {
        const flag = result.grade > whole.grade + 1 ? "  <- above average" : "";
        console.log(`    ${result.grade.toFixed(1).padStart(4)}  ${title}${flag}`);
    }
    console.log("");
}
