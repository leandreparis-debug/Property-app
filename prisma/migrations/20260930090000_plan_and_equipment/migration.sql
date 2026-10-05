BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[site_geometries] ADD [dock_side] NVARCHAR(8) NOT NULL CONSTRAINT [site_geometries_dock_side_df] DEFAULT 'a',
[volume_approximate] BIT NOT NULL CONSTRAINT [site_geometries_volume_approximate_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[site_plans] ADD [opacity] DECIMAL(3,2) NOT NULL CONSTRAINT [site_plans_opacity_df] DEFAULT 0.7,
[rms_error_m] DECIMAL(8,2),
[rotation_deg] DECIMAL(6,2);

-- Docks on the first (a) or second (b) long side of the oriented bounding rectangle.
-- (EXEC: compiled after the columns exist, SQL Server compiles a batch as a whole.)
EXEC(N'ALTER TABLE [dbo].[site_geometries] ADD CONSTRAINT [site_geometries_dock_side_check] CHECK ([dock_side] IN (N''a'', N''b''))');

-- Opacity of the plan overlay between 0 and 1.
EXEC(N'ALTER TABLE [dbo].[site_plans] ADD CONSTRAINT [site_plans_opacity_check] CHECK ([opacity] >= 0 AND [opacity] <= 1)');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
