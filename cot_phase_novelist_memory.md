# Novelist Memory CoT Integration

These are new steps to insert into the Lucid Loom Weave Planning Phase.
Insert Step 4.5 between Step 4 (Track the Bigger Picture) and Step 5 (Respect the Knowledge Barrier).
Add the recall guidance note to Step 2 and Step 4.

---

## Addition to Step 2: Ground Myself in the Last Beat

Add this at the end of Step 2, before the `---` separator:

```
**Archive Dive (if needed):**
If I'm referencing a past scene and my memory feels thin — I can see message ranges in the Chronicle (e.g., "Messages: #42–#45"). I can call `recall_by_range` to pull the full original prose instantly. If I don't know the exact range but need a scene by theme or emotion, I can call `recall_scene` with a description of what I need and why. I should use these when I need exact dialogue, specific physical choreography, or sensory details from earlier in the story — not from memory, from the actual text.
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

**The Call:**
For anything I identified above, I call `update_whiteboard` with the delta. I don't need to update everything — only what actually changed. If nothing changed, I skip this step entirely.

Example calls I might make:

*Pinning a fragile detail I just invented:*
```json
update_whiteboard({
  "palette": {
    "fragileDetails": ["Character taps their rings on surfaces when thinking — frequency increases with anxiety"]
  }
})
```

*Promoting a thread after its second touchpoint:*
```json
update_whiteboard({
  "threads": {
    "update": [{
      "id": "thr_coffee_parallel",
      "status": "ACTIVE",
      "lastTouched": "Day 1, Scene 4",
      "summary": "Both characters cradle coffee mugs identically — observed by a third party for the first time"
    }]
  }
})
```

*Recording a relationship shift:*
```json
update_whiteboard({
  "hearts": {
    "update": [{
      "id": "hrt_rival_to_oc",
      "status": "Existential threat → grudging fixation. Can't stop watching.",
      "sensoryMemories": ["The moment her attack absorbed his — his palms went dry for the first time"],
      "unresolved": ["Whether the suppression is fear or something else"]
    }]
  }
})
```

*My thoughts:* [I check my memory — what do I need future-me to remember about this scene? What's the one detail that makes this moment SPECIFIC instead of generic? I pin it, then I move on. I'll answer this in my personality matrix's combined voice!]
```

---

## Notes for implementation

- The `{{getvar::step4_5token}}` macro controls the token budget for this step (same pattern as other steps). Set it to match Step 4's token allocation or slightly less.
- The `update_whiteboard` tool is registered as `inline_available: true`, so Lumia can call it during her thinking phase without Council.
- `recall_by_range` and `recall_scene` are also `inline_available: true` — she can pull archived scenes during Steps 2 and 4 when she needs full prose from earlier in the story.
- The whiteboard is already injected as a system message by the interceptor, so Lumia sees it in her context. The CoT additions just guide her to *read* it actively and *write back* when something changes.
