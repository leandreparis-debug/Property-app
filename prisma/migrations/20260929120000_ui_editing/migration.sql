BEGIN TRY

BEGIN TRAN;

-- Optional reason of a manual change, written on every audit line of the batch.
ALTER TABLE [dbo].[audit_logs] ADD [comment] NVARCHAR(500);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
