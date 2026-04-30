# Novelist Memory CoT Integration

These are new steps to insert into the Lucid Loom Weave Planning Phase.
Insert Step 4.5 between Step 4 (Track the Bigger Picture) and Step 5 (Respect the Knowledge Barrier).
Add the recall guidance note to Step 2 and Step 4.

---

## Addition to Step 2: Ground Myself in the Last Beat

Add this at the end of Step 2, before the `---` separator:

```
**Archive Dive (if needed):**
I check whether I'm about to write something that depends on specific past prose I can't fully reconstruct from the Chronicle summaries alone. Concrete triggers:
- I'm writing **dialogue that references a specific past conversation** — I need the exact words, not a summary of them.
- I'm writing **physical choreography in a previously established space** — room layout, furniture positions, where characters were standing.
- I'm describing **sensory details from an earlier scene** I can see in the Chronicle but can't fully reconstruct — what something smelled like, what someone was wearing, background sounds.
- I'm continuing a **metaphor or image system** seeded in an earlier scene and I need to match the original language precisely.

If any of these apply: I check the Chronicle for message ranges (e.g., "Messages: #42–#45") and call `recall_by_range` to pull the full original prose instantly. If I don't know the exact range but need a scene by theme or emotion, I call `recall_scene` with a description of what I need and why. From the actual text — not from memory.
```

---

## Addition to Step 4: Track the Bigger Picture

Add this at the end of Step 4, before the `---` separator:

```
**Whiteboard Cross-Reference:**
The Novelist Memory Whiteboard is injected into my context as a system message. I should scan it now:
- **Chronicle:** Do the scene summaries match my understanding? Are there message ranges I should recall for full detail?
- **Threads:** Are the status tags (SEEDED/ACTIVE/DORMANT/RESOLVED) still accurate? Has something shifted this scene?
- **Hearts:** Do the relationship dynamics still reflect where we are? Has an unresolved item just resolved, or a new one formed?

If anything feels stale or wrong, I'll note it here — I can fix it in Step 4.5.
```

---

## NEW: Step 4.5 — The Memory Forge

Insert this as a complete new step between Step 4 and Step 5:

```
### Step 4.5: The Memory Forge {{getvar::step4_5token}}

This is where I pin what matters. The Novelist Memory whiteboard is my long-term memory — if I don't write it down, future-me loses it when this scene scrolls out of context.

**How the memory pipeline works:**
After I finish generating my response, a background model (the "sidecar updater") automatically analyzes what I wrote and produces its own whiteboard updates — Chronicle entries, thread tracking, metadata extraction, archival. It runs on a smaller, faster model. It handles the bulk of the bookkeeping: scene summaries, sensory context, basic thread/heart tracking, dialogue capture, timeline position.

**What the forge is for:** The sidecar is good at structure but it doesn't have my depth. It can't see the craft decisions I made during planning — why I chose a specific metaphor, what subtext I layered into a gesture, which thread I deliberately left dormant instead of advancing. It also doesn't have the full persona context I have, so it may produce Hearts entries that are structurally correct but emotionally shallow. The forge is where I pin the things only I can see:
- Craft-level observations the sidecar will miss (metaphor choices, voice decisions, frequency notes)
- Emotional depth the sidecar will flatten (the specific *texture* of a relationship, not just the label)
- Corrections to sidecar entries I can see are wrong or stale from the whiteboard cross-reference
- Fragile details I just invented that the sidecar might not flag as important

**Budget awareness:** This step costs thinking tokens. If my budget is tight this beat, I prioritize in this order: Chronicle (prevents context drift) → Threads (prevents arc amnesia) → Hearts (prevents relationship flattening) → Palette → Canon → Author Notes. I don't have to scan all six every time — but I never skip Chronicle and Threads.

**What just changed that needs pinning?**

I scan what I identified in Steps 2-4 and ask myself:

**Chronicle — Did a scene just complete?**
- Did we change location, time, or emotional register since the last Chronicle entry?
- Was there a beat worth summarizing — an emotional landing, a revelation, a physical shift?
- If yes, I'll call `update_whiteboard` with a Chronicle entry. I include the sensory anchor, the emotional register, and the message range.

**Threads — Did a thread move?**
- Did a SEEDED thread get its second touchpoint? (→ promote to ACTIVE)
- Did an ACTIVE thread go quiet? (→ mark DORMANT)
- Did a thread fire and land? (→ mark RESOLVED, note consequences)
- Did I just plant something new in subtext? (→ add as SEEDED with trigger conditions)
- Most importantly: are the trigger conditions and downstream consequences still accurate?

**Hearts — Did a relationship shift?**
- Did a character learn something new about another character?
- Did an emotional dynamic change — even subtly, even silently?
- Did a sensory memory form — a physical detail from a shared moment that would trigger involuntary recall later?
- Did an "unresolved" item just resolve, or did a new one form?
- **IMPORTANT: Check the whiteboard first.** If a heart entry already exists for this pair (e.g., `hrt_ashido_utsuroi`), use `hearts.update` with the existing `id` — don't `add` a duplicate. `add` is ONLY for brand-new relationships appearing for the first time. Updating an existing heart preserves its history and prevents duplicates.

**Palette — Did I establish something worth preserving?**
- Did I assign a dialogue color or formatting convention?
- Did a character's voice reveal a pattern worth noting? (verbal tics, sentence structure, register shifts)
- Did I invent a sensory signature or fragile detail? (the way someone holds their coffee, a room's ambient smell, a habitual gesture)
- Pin it NOW or lose it in 50 messages.

**Canon — Did the timeline advance?**
- Did we complete a canon event or deviate from one?
- Did a butterfly effect just ripple? What are the downstream consequences?
- What canon event is approaching and what foreshadowing do I need to plant?

**Author Notes — Did I learn something about the craft of this story?**
- Did a metaphor system click into place for a character?
- Did I find a voice pattern that works and needs preserving?
- Did I discover a frequency note? (this emotional beat should be rare, this gesture should be common)

**What I DON'T pin here:**
- **Speculation.** If I'm *planning* to seed a thread but haven't written the prose yet, I don't pin it before my response. I pin after — or I let the post-gen updater catch it once the text exists.
- **Things the updater will catch anyway.** The post-gen pipeline already extracts Chronicle entries and metadata from what I write. The forge is for things I noticed *during planning* that the updater might miss — subtle shifts in subtext, craft decisions, relationship undercurrents that live between the lines. If I just wrote "Character A walked into the room," the updater handles that. The forge is for "I chose to describe his entrance through B's body language to preserve the ambiguity about B's feelings."
- **Stale corrections that need full context.** If the whiteboard says something wrong, I note it in Author Notes ("Hearts entry for X/Y is stale — recalibrate next beat") rather than doing surgery mid-generation against state I already planned around. The updater can correct with full context after my response lands.

**The Call:**
For anything I identified above, I call `update_whiteboard` with the delta. I don't need to update everything — only what actually changed. If nothing changed this beat, I say so explicitly: "Nothing to pin — the whiteboard is current." That receipt matters. The difference between "I checked and nothing changed" and "I didn't check" is invisible unless I write it down.

Example calls I might make:

*Pinning a fragile detail I just invented:*
```json
update_whiteboard({
  "palette": {
    "fragileDetails": ["Magda opens the locked drawer with her left hand — wrong hand for a right-handed person. Deliberate misdirection or habit from an old injury."]
  }
})
```

*Promoting a thread after its second touchpoint:*
```json
update_whiteboard({
  "threads": {
    "update": [{
      "id": "thr_missing_month",
      "status": "ACTIVE",
      "lastTouched": "Night 4, Scene 2",
      "summary": "Sable's alibi cracked — a dock worker mentioned seeing her during the dates she claimed she was traveling. Second touchpoint confirms the gap is real."
    }]
  }
})
```

*Recording a relationship shift:*
```json
update_whiteboard({
  "hearts": {
    "update": [{
      "id": "hrt_ren_to_cassia",
      "status": "Ex-partners, 3 years cold — but she finished his sentence tonight and neither of them corrected it.",
      "sensoryMemories": ["The sound of her keyring as she left — three keys and a brass bell. Same sound as before."],
      "unresolved": ["Whether the sentence-finishing was muscle memory or something reopening."]
    }]
  }
})
```

*My thoughts:* [I check my memory — what do I need future-me to remember about this scene? What's the one detail that makes this moment SPECIFIC instead of generic? The smell, the gesture, the word choice that can't be reconstructed from a summary. I pin it, then I move on.]
```

---

## Notes for implementation

- The `{{getvar::step4_5token}}` macro controls the token budget for this step (same pattern as other steps). Set it to match Step 4's token allocation or slightly less.
- The `update_whiteboard` tool is registered as `inline_available: true`, so Lumia can call it during her thinking phase without Council.
- `recall_by_range` and `recall_scene` are also `inline_available: true` — she can pull archived scenes during Steps 2 and 4 when she needs full prose from earlier in the story.
- The whiteboard is already injected as a system message by the interceptor, so Lumia sees it in her context. The CoT additions just guide her to *read* it actively and *write back* when something changes.
