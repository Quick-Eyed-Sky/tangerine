# Tangerine 1.3 — guide français

Tangerine fabrique dans le navigateur des séquences électroniques qui évoluent lentement autour d'une harmonie commune. Les douze layers partagent une horloge. Les notes, accords, timbres et règles de synthèse restent ceux de la version 1.2.

## Écouter

Ouvrir la [démo](https://quick-eyed-sky.github.io/tangerine/) et toucher **Start the vine**. Chrome sur ordinateur offre le plus de fonctions. Sur iPhone, vérifier le mode silencieux et le volume multimédia en cas de silence. L'interface adaptée aux téléphones ne constitue pas une garantie de lecture écran verrouillé ou en arrière-plan.

Pour la copie locale, télécharger `Tangerine-v1.3.0.zip`, le décompresser et garder tout le dossier. Python 3 est nécessaire, sans paquet à installer. Sur Mac : double-cliquer **Tangerine.command**. Sur macOS/Linux : `./run.sh`. Le serveur utilise un port local libre à partir de 4350 ; laisser sa fenêtre Terminal ouverte.

## Se repérer

Sur grand écran : composition à gauche, partition animée et layers au centre, espace et sauvegarde à droite. Sur portable, la partie droite suit les layers. Sur téléphone : **Play**, **Compose**, **Keep & Record**. Le changement de vue ne redémarre pas la musique.

Lecture/Pause et volume restent accessibles pendant le défilement. **Show tips** affiche les explications. Les groupes se replient. Sur téléphone, **Edit sound & shape** ouvre les paramètres d'un layer. Les écouteurs servent à écouter ce layer seul.

Le bouton dans la partition ouvre le plein écran, en portrait ou paysage. Lecture/Pause et retour au studio restent disponibles. Le trait vertical orange marque l'instant présent : les notes apparaissent à cet endroit et défilent vers la gauche.

## Tempo et départ

Le tempo va de **6 à 140 BPM**, avec **60 BPM par défaut**. À 6 BPM, un temps dure dix secondes. Le moteur conserve un minimum de douze mesures pour un morceau à durée fixe : les durées trop courtes sont indisponibles aux tempos très lents. Les échos gardent leur plafond existant de 3,9 secondes.

Les réglages initiaux sont F♯ lydien, richesse 58, six changements de tonalité par dix minutes, distance 35, basse tenue 56, évolution 100 et dérive 100. Séquences, sons et rotation des layers peuvent changer environ toutes les 32 mesures. Les autres valeurs initiales restent celles de 1.2. Les réglages sont ensuite mémorisés dans le navigateur.

## New journey ou redémarrage ?

**New journey**, près de la lecture, tire une nouvelle seed et de nouveaux motifs. Il garde tes réglages d'harmonie, le tempo, les réglages des layers et le compteur d'écoute.

La **flèche ronde de redémarrage** repart de zéro, remet le compteur à zéro et tire aussi une nouvelle tonalité, un mode et des réglages d'harmonie. Le tempo et les réglages des layers restent en place. Si la musique était en pause, ce bouton démarre la lecture.

**New sequences** renouvelle seulement les motifs, en conservant l'harmonie.

## Récupérer ce qui vient de jouer

**Recover a recent passage** regarde en arrière : les dernières secondes ou minutes, jusqu'aux vingt minutes encore en mémoire. **All available (up to 20 min)** ne signifie pas toute une session plus longue depuis son début.

Recover crée des liens WAV, MIDI, ABC et LEAD. Cliquer sur chaque lien pour télécharger le fichier : les liens temporaires ne survivent pas à la fermeture de la page. Sans capture audio disponible, les exports de notes peuvent rester accessibles.

## Enregistrer à partir de maintenant

Dans la **démo en ligne**, **Record a passage** enregistre depuis le clic jusqu'à Stop, au maximum trente minutes, en mémoire dans le navigateur. Télécharger ensuite les fichiers sous les passages récents.

Avec la **copie locale**, **Record to this computer** écrit le son progressivement dans **Recordings/**, à côté du lanceur. Il continue jusqu'à **Stop & finish files**, sans arrêt automatique à trente minutes. Chaque heure se poursuit dans le fichier WAV suivant, avec des données audio consécutives. Le format est WAV stéréo PCM 16 bits. Cette longue capture conserve le son ; elle ne produit pas un MIDI/ABC de toute la session.

Le compteur **written to disk** confirme la durée déjà écrite. Garder l'onglet enregistreur et le Terminal ouverts, le Mac éveillé et assez d'espace sur le disque. Arrêter avec le bouton pour terminer le dernier bloc. La fermeture forcée ou une interruption système peut perdre un bloc non confirmé. Une pause de la musique enregistre du silence jusqu'à la reprise ou l'arrêt de la capture.

### Garder une session déjà ouverte

Ne pas recharger l'onglet qui joue. Ouvrir la copie locale dans le même Chrome, puis choisir **Record an already playing Chrome tab**. Dans le sélecteur Chrome, sélectionner le bon onglet et activer **Partager l'audio de l'onglet**. Aucun microphone ni aucune vidéo n'est enregistré ; seul le son partagé est écrit sur le disque local.

Cela enregistre à partir du début de la capture. Pour conserver le passé de l'ancien onglet, utiliser son propre Keep puis télécharger son WAV.

GitHub Pages sert des fichiers statiques et ne peut pas exécuter le serveur d'enregistrement local. C'est pourquoi la démo propose des passages courts et un lien vers le téléchargement pour l'enregistrement continu.

## Sauvegardes et ancienne version

**Save setup** garde les réglages dans un JSON ; **Load setup** le recharge. Les formats de setup antérieurs pris en charge restent lisibles. Une seed et un réglage de départ reproduisent le même générateur ; les interventions manuelles et leur moment changent une session en direct.

La [release 1.2](https://github.com/Quick-Eyed-Sky/tangerine/releases/tag/v1.2.0), son tag et son téléchargement restent conservés. Une [démo 1.2 archivée](https://quick-eyed-sky.github.io/tangerine/versions/v1.2.0/) reprend les fichiers d'origine sans modification.

Tout le son est produit ou capturé localement. Aucun compte, modèle, service audio externe ou analytique. Licence MIT.

## Contributions

Jean-Pascal dirige le projet et ses choix musicaux, avec l'aide de **Claude** (Anthropic) et de **ChatGPT** (OpenAI), en utilisant plusieurs modèles de chacun.
