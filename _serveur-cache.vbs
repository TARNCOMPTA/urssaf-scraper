' Lance l'application SANS aucune fenetre visible :
'   1) mise a jour automatique (maj.js), 2) serveur Node, 3) navigateur.
' Appele par Demarrer.bat. Pour arreter : bouton "Quitter" dans la page,
' ou double-clic sur Quitter.bat.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)

' Arrete proprement une instance precedente (si l'appli tournait deja), pour que
' relancer "Demarrer" recharge bien la derniere version (sinon le port 3000 est
' deja pris et le nouveau serveur ne peut pas demarrer).
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.open "POST", "http://localhost:3000/api/quit", False
http.send
On Error GoTo 0
WScript.Sleep 1500

' 0 = fenetre masquee. True = attendre la fin de la mise a jour avant de demarrer.
sh.Run "node maj.js", 0, True

' Demarre le serveur, masque, sans attendre.
sh.Run "node --disable-warning=ExperimentalWarning server.js", 0, False

' Laisse le serveur demarrer, puis ouvre le navigateur (seule fenetre visible).
WScript.Sleep 3000
sh.Run "http://localhost:3000", 1, False
