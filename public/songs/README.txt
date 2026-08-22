Guess-the-song clips for the wall display.

Drop the audio files in this folder and list them in manifest.json:

  {
    "clips": [
      { "file": "song-1.mp3", "answer": "Pasoori" },
      { "file": "song-2.mp3", "answer": "Afreen Afreen" }
    ]
  }

  file    the filename in this folder. mp3 or m4a.
  answer  optional. Shown on the wall only after the clip has finished,
          so the room has something to shout at.

The wall plays the next unplayed clip when a round ends, for twenty seconds.
No clips, or an empty list, and the song round simply does not appear —
nothing breaks and no empty panel is shown.

One thing browsers force on us: a page cannot play sound until somebody has
tapped it. The wall shows a "Tap once for sound" button the first time; press it
when you set the television up and it stays unlocked for the rest of the day.
