BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[sessions] (
    [id] NVARCHAR(64) NOT NULL,
    [user_id] NVARCHAR(30) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [sessions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [expires_at] DATETIME2 NOT NULL,
    [idle_expires_at] DATETIME2 NOT NULL,
    [last_seen_at] DATETIME2 NOT NULL,
    [ip_address] NVARCHAR(45),
    [user_agent] NVARCHAR(255),
    CONSTRAINT [sessions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sessions_user_id_idx] ON [dbo].[sessions]([user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sessions_expires_at_idx] ON [dbo].[sessions]([expires_at]);

-- AddForeignKey
ALTER TABLE [dbo].[sessions] ADD CONSTRAINT [sessions_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
