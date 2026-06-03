# Lessons Learned — NexoSmart Mail

## Patterns & Corrections
*(Updated as corrections are made)*

### 2026-05-04 — Estado lógico vs labels visibles
- **Patrón:** las "carpetas" del sidebar (INBOX, TRASH, SPAM, SENT…) se filtran por LABEL (`whereHas('labels', name=...)`), pero las acciones de usuario (trash/spam) se modelaron con flags booleanos en `ThreadUserState`. Estos dos modelos pueden quedar desincronizados.
- **Regla:** cuando una acción cambia el estado lógico de un thread (trash, spam, archive), SIEMPRE sincronizar también las labels que lo hacen visible/invisible en el sidebar.
  - trash → detach INBOX, attach TRASH
  - untrash → detach TRASH, attach INBOX
  - spam → detach INBOX, attach SPAM (ya implementado correctamente desde el principio)
  - not_spam → detach SPAM, attach INBOX (idem)
- **Cómo testear:** un feature test mínimo que dispara la acción y verifica `$thread->labels()->pluck('name')` antes/después.

### 2026-05-04 — `TrackSession` middleware peta sin sesión
- `App\Http\Middleware\TrackSession::handle` llama `$request->session()->getId()` sin chequear `$request->hasSession()`. Tira `RuntimeException: Session store not set on request` en cualquier request sin sesión (Bearer token, tests, API stateless).
- **Workaround tests:** `$this->withoutMiddleware(\App\Http\Middleware\TrackSession::class)` en `setUp`.
- **Fix definitivo (cuando se quiera Bearer):** wrap en `if ($request->hasSession() && $request->session()->isStarted())` antes de leer.

### 2026-05-04 — phpunit con sqlite + migración fulltext
- Las migraciones MySQL-only (fulltext indexes, foreign key cascades exóticos) deben tener early-return cuando driver sea sqlite, si no `RefreshDatabase` falla en tests.
- Patrón: `if (Schema::getConnection()->getDriverName() === 'sqlite') return;` al principio de `up()`/`down()`.

### 2026-05-04 — Adjuntos entrantes Resend
- Webhook de Resend con adjuntos base64 inline → infla ~33% por encoding. Sin `client_max_body_size` en nginx, default 1MB rechaza con 413 antes de llegar a Laravel y los adjuntos nunca se procesan.
- `ProcessInboundEmail` debe ser tolerante a fallos POR ADJUNTO (try/catch envolviendo `Storage::put` + `Attachment::create`), no abortar todo el job si uno falla.
- `base64_decode($content, true)` puede retornar `false` — NO usar `?: $content` como fallback porque guarda string base64 cruda como archivo corrupto. Usar `Log::warning` + `continue`.
- Si el webhook viene sin `email_id`, `fetchAttachmentDownloadUrls(null)` retorna [] y los adjuntos se pierden. Hacer early-return con log explícito.
- `content_id` puede venir con o sin `<>` — normalizar siempre con `trim($cid, '<> ')` y reemplazar con regex case-insensitive: `/cid:\s*<?\Q...\E>?/i`.

### 2026-05-04 — Test efficiency con ignore-platform-reqs
- Si la PC local tiene PHP 8.3 pero el composer.lock requiere 8.4 (Symfony 8), correr `composer install --ignore-platform-reqs` SOLO para correr tests/leer código. NO commitear cambios al lockfile. Es seguro porque las features que requieren 8.4 raramente se ejercitan en tests del módulo target.
