BEGIN TRY

BEGIN TRAN;

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_actor_id_occurred_at_idx] ON [dbo].[audit_logs]([actor_id], [occurred_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_source_occurred_at_idx] ON [dbo].[audit_logs]([source], [occurred_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_field_idx] ON [dbo].[audit_logs]([field]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

