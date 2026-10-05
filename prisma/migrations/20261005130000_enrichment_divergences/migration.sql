BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[enrichment_divergences] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [target] NVARCHAR(50) NOT NULL,
    [current_value] NVARCHAR(max),
    [proposed_value] NVARCHAR(max) NOT NULL,
    [proposed_sha256] CHAR(64) NOT NULL,
    [provider] NVARCHAR(40) NOT NULL,
    [confidence] DECIMAL(4,3),
    [evidence] NVARCHAR(1000),
    [batch_id] NVARCHAR(30) NOT NULL,
    [status] NVARCHAR(10) NOT NULL CONSTRAINT [enrichment_divergences_status_df] DEFAULT 'open',
    [resolved_by_id] NVARCHAR(30),
    [resolved_at] DATETIME2,
    [resolution_comment] NVARCHAR(500),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [enrichment_divergences_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [enrichment_divergences_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [enrichment_divergences_site_id_target_proposed_sha256_idx] ON [dbo].[enrichment_divergences]([site_id], [target], [proposed_sha256]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [enrichment_divergences_status_created_at_idx] ON [dbo].[enrichment_divergences]([status], [created_at]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [enrichment_divergences_one_open] ON [dbo].[enrichment_divergences]([site_id], [target], [proposed_sha256]) WHERE ([status] = N'open');

-- AddForeignKey
ALTER TABLE [dbo].[enrichment_divergences] ADD CONSTRAINT [enrichment_divergences_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[enrichment_divergences] ADD CONSTRAINT [enrichment_divergences_resolved_by_id_fkey] FOREIGN KEY ([resolved_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddCheckConstraint (hand-written: Prisma cannot express CHECK constraints).
EXEC(N'ALTER TABLE [dbo].[enrichment_divergences] ADD CONSTRAINT [enrichment_divergences_status_check] CHECK ([status] IN (N''open'', N''accepted'', N''dismissed''))');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

