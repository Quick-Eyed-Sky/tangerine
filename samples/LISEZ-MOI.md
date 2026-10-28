# Samples de Tangerine II

Ce dossier reste sur ton Mac : il n'est pas envoyé sur GitHub, car la plupart des licences de samples n'autorisent pas le partage.

## Comment ça marche

- **Un dossier par instrument.** Tous les fichiers audio qu'il contient (WAV, AIFF, FLAC, OGG, MP3) forment l'instrument.
- **La hauteur des notes.** Un nom de note dans le nom du fichier (`Choir C3.wav`, `Violins F#2.wav`) indique sa hauteur. Sinon, Tangerine la mesure à l'écoute, et corrige aussi une éventuelle erreur d'octave.
- **Les espaces.** `_spaces/` reçoit les vraies réverbérations (réponses impulsionnelles, en WAV).
- **Au lancement.** Tangerine lit ce dossier quand on lance le lanceur local (`Tangerine.command`). Ajoute des sons, puis recharge la page.
- **Les couleurs.** Une couleur cherche certains noms de dossier ci-dessous. Si un dossier manque, la couche reste en synthèse.
- **Les réglages par instrument.** Un fichier `instrument.json` facultatif peut contenir `{"label": "Mellotron Choir", "gain": 0.8}`.
- **Pour essayer sans rien télécharger :** `python3 tools/test-samples.py` crée des sons d'essai.

## Dossiers attendus par les couleurs

| Dossier | Couleur | Où le trouver |
| --- | --- | --- |
| `mellotron-choir`, `mellotron-strings`, `mellotron-violins`, `mellotron-cello`, `mellotron-flute` | Phaedra 1974 | Samples Mellotron de Taijiguy (gratuits, environ 20 Mo par instrument) |
| `moog-bass`, `moog-sequence`, `moog-lead` | Phaedra, Moon Safari | Legowelt « Moog Minimoog », ou Soundpacks « Moog Model Ten » |
| `e-piano` | Phaedra, Moon Safari | À trouver (Rhodes ou Wurlitzer gratuit) |
| `prophet-pad`, `prophet-bass`, `prophet-sequence`, `prophet-lead` | Stratosfear / Exit | Legowelt « Prophet 600 », Principleasure « Prophet 5 » |
| `jupiter-pad`, `jupiter-strings`, `jupiter-bass`, `jupiter-sequence`, `jupiter-lead`, `jupiter-bells` | Stratosfear / Exit | Legowelt « Jupiter 8 » |
| `ob-pad` | Stratosfear / Exit | Principleasure « OB-8 », Legowelt « Matrix 1000 » |
| `solina` ou `string-machine` | Moon Safari | À trouver (Solina ou Eminent gratuit) |
| `_spaces/church.wav`, `cathedral`, `hall`, `plate`, `room`, `studio` | Selon la couleur | Bibliothèque OpenAIR (Université de York) |

Les packs Legowelt rangent un son par fichier, chacun sur une seule note. Il suffit de copier dans un dossier les sons qui vont ensemble, par exemple des basses dans `prophet-bass`. Tangerine transpose depuis la note la plus proche.
