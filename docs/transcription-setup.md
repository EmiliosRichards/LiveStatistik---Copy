Hi Lorenz and Matthias,
 
I've launched a 24/7 transcription gateway on our server. It’s a simple HTTPS API: you submit a recording (by id or URL), and a background worker uploads the audio to B2, transcribes it, and stores the result in our database. It runs autonomously and only processes items you submit.
 
How to use
- Base URL: https://transcribe.vertikon.ltd
- Auth: add header X-API-Key: 6f3183adee8b8e296a1101dd414d4c0cc5c26d35411747a5
 
1) Submit a job (preferred: recording_id from our DB)
- Content-Type: application/x-www-form-urlencoded
- Fields: recording_id=<id> (or url=<exact public.recordings.location>), and b2_prefix=gateway (keeps files in our “gateway” namespace)
Example (PowerShell/curl):
$API="6f3183adee8b8e296a1101dd414d4c0cc5c26d35411747a5"
$RID="ffffce39b1c0e52b200656eb6eb7c238"
curl.exe -H "X-API-Key: $API" -H "Content-Type: application/x-www-form-urlencoded" --data "recording_id=$RID&b2_prefix=gateway" https://transcribe.vertikon.ltd/api/media/transcribe
The response returns an audio_file_id.
 
2) Check status
$AID=<audio_file_id_from_submit>
curl.exe -H "X-API-Key: $API" https://transcribe.vertikon.ltd/api/media/status/$AID
- status will move from pending to completed
- response includes the transcript and the B2 keys for JSON/TXT
 
Notes
- Duplicate protection: if a recording already has a completed transcription, the API immediately returns the existing result (no re‑upload or re‑transcribe).
- Storage layout:
  - Audio: gateway/<campaign>/audio/<phone>/<uuid>.mp3
  - Transcripts: gateway/<campaign>/transcriptions/json|txt/<phone>/<uuid>.<ext>