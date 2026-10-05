BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[job_runs] (
    [id] NVARCHAR(30) NOT NULL,
    [job] NVARCHAR(40) NOT NULL,
    [trigger] NVARCHAR(10) NOT NULL,
    [status] NVARCHAR(10) NOT NULL CONSTRAINT [job_runs_status_df] DEFAULT 'running',
    [business_date] DATE NOT NULL,
    [started_at] DATETIME2 NOT NULL CONSTRAINT [job_runs_started_at_df] DEFAULT CURRENT_TIMESTAMP,
    [finished_at] DATETIME2,
    [summary_json] NVARCHAR(max),
    [error] NVARCHAR(2000),
    [triggered_by_id] NVARCHAR(30),
    CONSTRAINT [job_runs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [job_runs_job_started_at_idx] ON [dbo].[job_runs]([job], [started_at]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [job_runs_one_running] ON [dbo].[job_runs]([job]) WHERE ([status] = N'running');

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [job_runs_one_scheduled_success] ON [dbo].[job_runs]([job], [business_date]) WHERE ([status] = N'success' AND [trigger] IN (N'scheduled', N'catchup'));

-- AddForeignKey
ALTER TABLE [dbo].[job_runs] ADD CONSTRAINT [job_runs_triggered_by_id_fkey] FOREIGN KEY ([triggered_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddCheckConstraint (hand-written: Prisma cannot express CHECK constraints).
-- (EXEC: compiled after the table exists, SQL Server compiles a batch as a whole.)
EXEC(N'ALTER TABLE [dbo].[job_runs] ADD CONSTRAINT [job_runs_trigger_check] CHECK ([trigger] IN (N''scheduled'', N''catchup'', N''manual'', N''cli''))');
EXEC(N'ALTER TABLE [dbo].[job_runs] ADD CONSTRAINT [job_runs_status_check] CHECK ([status] IN (N''running'', N''success'', N''failed''))');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

