' Lance le serveur Node SANS aucune fenetre visible, puis ouvre le navigateur.
' Appele par Demarrer.bat. Pour arreter le serveur : bouton "Quitter" dans la
' page, ou double-clic sur Quitter.bat.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
' 0 = fenetre masquee ; False = ne pas attendre la fin.
sh.Run "cmd /c node --disable-warning=ExperimentalWarning server.js", 0, False
WScript.Sleep 3000
sh.Run "http://localhost:3000", 1, False
