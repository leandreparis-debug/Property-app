BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[site_geometries] ADD [fetched_at] DATETIME2,
[height_m] DECIMAL(8,2),
[source_ref] NVARCHAR(100);

-- AlterTable
ALTER TABLE [dbo].[sites] ADD [commune_insee_code] NVARCHAR(5);

-- CreateTable
CREATE TABLE [dbo].[site_public_data] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [provider] NVARCHAR(40) NOT NULL,
    [key] NVARCHAR(80) NOT NULL,
    [value_json] NVARCHAR(max) NOT NULL,
    [fetched_at] DATETIME2,
    [batch_id] NVARCHAR(30),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [site_public_data_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [site_public_data_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [site_public_data_site_id_provider_key_key] UNIQUE NONCLUSTERED ([site_id],[provider],[key])
);

-- AddForeignKey
ALTER TABLE [dbo].[site_public_data] ADD CONSTRAINT [site_public_data_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
