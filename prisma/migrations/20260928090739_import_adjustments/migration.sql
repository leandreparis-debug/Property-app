BEGIN TRY

BEGIN TRAN;

-- DropIndex
ALTER TABLE [dbo].[site_external_ids] DROP CONSTRAINT [site_external_ids_site_id_system_key];

-- AlterTable
ALTER TABLE [dbo].[building_works] ADD [date_precision] NVARCHAR(8);

-- AlterTable
ALTER TABLE [dbo].[sites] ADD [activity_start_date_precision] NVARCHAR(8);

-- CreateIndex
CREATE NONCLUSTERED INDEX [site_external_ids_site_id_system_idx] ON [dbo].[site_external_ids]([site_id], [system]);

-- AddCheckConstraint (hand-written: Prisma cannot express CHECK constraints).
-- EXEC: the columns are added in this same batch, so the constraints must be
-- compiled separately (SQL Server resolves column names at batch compile time).
EXEC(N'ALTER TABLE [dbo].[sites] ADD CONSTRAINT [sites_activity_start_date_precision_check] CHECK ([activity_start_date_precision] IN (N''day'', N''month'', N''year''))');

-- AddCheckConstraint
EXEC(N'ALTER TABLE [dbo].[building_works] ADD CONSTRAINT [building_works_date_precision_check] CHECK ([date_precision] IN (N''day'', N''month'', N''year''))');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
