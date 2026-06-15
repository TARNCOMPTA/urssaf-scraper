' Lance l'application SANS aucune fenetre visible :
'   1) mise a jour automatique (maj.js), 2) serveur Node, 3) navigateur.
' Appele par Demarrer.bat. Pour arreter : bouton "Quitter" dans la page,
' ou double-clic sur Quitter.bat.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)

' 0 = fenetre masquee. True = attendre la fin de la mise a jour avant de demarrer.
sh.Run "node maj.js", 0, True

' Demarre le serveur, masque, sans attendre.
sh.Run "node --disable-warning=ExperimentalWarning server.js", 0, False

' Laisse le serveur demarrer, puis ouvre le navigateur (seule fenetre visible).
WScript.Sleep 3000
sh.Run "http://localhost:3000", 1, False
