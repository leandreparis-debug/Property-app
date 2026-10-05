BEGIN TRY

BEGIN TRAN;

-- On-demand exports (step 11) leave an EXPORT line in the audit journal.
-- Constraint replaced (hand-written: Prisma cannot express CHECK constraints).
ALTER TABLE [dbo].[audit_logs] DROP CONSTRAINT [audit_logs_action_check];
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_action_check] CHECK ([action] IN (N'CREATE', N'UPDATE', N'DELETE', N'IMPORT', N'ENRICH', N'LOGIN', N'LOGIN_FAILED', N'LOGOUT', N'EXPORT'));

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
