BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[app_settings] (
    [id] NVARCHAR(30) NOT NULL,
    [key] NVARCHAR(100) NOT NULL,
    [value_json] NVARCHAR(max) NOT NULL,
    [updated_by_id] NVARCHAR(30),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [app_settings_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [app_settings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [app_settings_key_key] UNIQUE NONCLUSTERED ([key])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

