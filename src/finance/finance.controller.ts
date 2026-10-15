import {
    BadRequestException,
    Controller,
    Post,
    UseInterceptors,
    Body,
    UploadedFile,
    ParseFilePipe,
    MaxFileSizeValidator,
    Get,
    Param,
    Query,
    Put,
    Delete,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { FinanceService } from './finance.service.js'
import {
    CsvColumnMappings,
    ExecutionTypeWithAmounts,
    TopSpendingCategoryForMonth,
    AmountPerWeekday,
    FinanceScope,
    AliasRule,
} from '../core/index.js'

@Controller('finance')
export class FinanceController {
    constructor(private readonly financeService: FinanceService) {}

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    uploadCSVFile(
        @Body('columnMappings') columnMappingsString: string,
        @Body('ledgerId') ledgerId: string,
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 }), // 1 MB
                ],
            })
        )
        file: Express.Multer.File
    ) {
        let columnMappings: CsvColumnMappings
        try {
            columnMappings = columnMappingsString ? JSON.parse(columnMappingsString) as CsvColumnMappings : {}
        } catch {
            throw new BadRequestException('columnMappings must be valid JSON')
        }
        if (Object.values(columnMappings).some((header) => typeof header !== 'string')) {
            throw new BadRequestException('columnMappings values must be CSV header names')
        }
        this.requireLedger(ledgerId)
        const result = this.financeService.addUploadedFile(ledgerId, file.path, file.originalname, columnMappings)
        return { ledgerId: result.ledgerId, sourceId: result.source.id }
    }

    @Get('ledgers')
    getLedgers() { return this.financeService.getLedgers() }

    @Post('ledgers')
    createLedger(@Body() body: { name?: string; files?: string[]; importProfile?: string }) {
        const files = Array.isArray(body.files) ? body.files.filter((value): value is string => typeof value === 'string') : []
        if (body.files !== undefined && (!Array.isArray(body.files) || files.length !== body.files.length)) throw new BadRequestException('files must be a list of CSV filenames')
        return this.financeService.createLedger(this.requireText(body.name, 'name'), files, typeof body.importProfile === 'string' ? body.importProfile : undefined)
    }

    @Get('import-profiles')
    getImportProfiles() { return this.financeService.getImportProfiles() }

    @Post('import-profiles')
    saveImportProfile(@Body() body: { name?: string; mappings?: Record<string, string> }) {
        if (typeof body.mappings !== 'object' || !body.mappings || Array.isArray(body.mappings)) throw new BadRequestException('mappings must be an object')
        if (Object.values(body.mappings).some((header) => typeof header !== 'string')) throw new BadRequestException('mapping values must be CSV header names')
        return this.financeService.saveImportProfile(this.requireText(body.name, 'name'), body.mappings)
    }

    @Get('dashboard/:ledgerId')
    getDashboard(
        @Param('ledgerId') ledgerId: string,
        @Query('mode') mode = 'month',
        @Query('month') month?: string,
        @Query('year') year?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('top') top = '5'
    ) {
        const requestedTop = Number(top)
        if (!Number.isInteger(requestedTop) || requestedTop < 1 || requestedTop > 50) {
            throw new BadRequestException('top must be an integer between 1 and 50')
        }

        return this.financeService.getDashboard(
            this.requireLedger(ledgerId),
            this.parseScope(mode, month, year, from, to),
            requestedTop
        )
    }

    @Get('rules/:ledgerId')
    getRules(@Param('ledgerId') ledgerId: string) {
        return this.financeService.getRules(this.requireLedger(ledgerId))
    }

    @Get('recurring/:ledgerId')
    getRecurring(@Param('ledgerId') ledgerId: string) {
        return this.financeService.getRecurring(this.requireLedger(ledgerId))
    }

    @Get('recurring/:ledgerId/settings')
    getRecurringSettings(@Param('ledgerId') ledgerId: string) {
        return this.financeService.getRecurringSettings(this.requireLedger(ledgerId))
    }

    @Put('recurring/:ledgerId/aliases/:targetId')
    setRecurringAlias(@Param('ledgerId') ledgerId: string, @Param('targetId') targetId: string, @Body() body: Record<string, unknown>) {
        const alias = typeof body.alias === 'string' ? body.alias.trim() || undefined : undefined
        const seriesIds = Array.isArray(body.seriesIds) ? body.seriesIds.filter((value): value is string => typeof value === 'string') : []
        if (!seriesIds.length) throw new BadRequestException('seriesIds must contain at least one recurring series id')
        return this.financeService.setRecurringAlias(this.requireLedger(ledgerId), targetId, alias, seriesIds)
    }

    @Post('recurring/:ledgerId/groups')
    createRecurringGroup(@Param('ledgerId') ledgerId: string, @Body() body: Record<string, unknown>) {
        const seriesIds = Array.isArray(body.seriesIds) ? body.seriesIds.filter((value): value is string => typeof value === 'string') : []
        return this.financeService.createRecurringGroup(this.requireLedger(ledgerId), seriesIds)
    }

    @Delete('recurring/:ledgerId/groups/:groupId')
    deleteRecurringGroup(@Param('ledgerId') ledgerId: string, @Param('groupId') groupId: string) {
        return this.financeService.deleteRecurringGroup(this.requireLedger(ledgerId), groupId)
    }

    @Put('recurring/:ledgerId/decisions/:seriesId')
    setRecurringDecision(@Param('ledgerId') ledgerId: string, @Param('seriesId') seriesId: string, @Body() body: Record<string, unknown>) {
        if (body.decision !== 'confirmed' && body.decision !== 'denied') throw new BadRequestException('decision must be confirmed or denied')
        return this.financeService.setRecurringDecision(this.requireLedger(ledgerId), seriesId, body.decision)
    }

    @Put('recurring/:ledgerId/statements/:statementId')
    setManualRecurring(@Param('ledgerId') ledgerId: string, @Param('statementId') statementId: string, @Body() body: Record<string, unknown>) {
        if (body.direction !== 'income' && body.direction !== 'expense' && body.direction !== null) throw new BadRequestException('direction must be income, expense, or null')
        return this.financeService.setManualRecurring(this.requireLedger(ledgerId), statementId, body.direction ?? undefined)
    }

    @Post('categories')
    createCategory(@Body() body: { name?: string; necessity?: 'necessity' | 'convenience' }) {
        return this.financeService.createCategory(this.requireText(body.name, 'name'), this.requireNecessity(body.necessity))
    }

    @Put('categories/:id')
    updateCategory(@Param('id') id: string, @Body() body: { name?: string; necessity?: 'necessity' | 'convenience' }) {
        return this.financeService.updateCategory(id, this.requireText(body.name, 'name'), this.requireNecessity(body.necessity))
    }

    @Delete('categories/:id')
    deleteCategory(@Param('id') id: string) {
        return this.financeService.deleteCategory(id)
    }

    @Post('rules/:ledgerId/aliases')
    createAlias(@Param('ledgerId') ledgerId: string, @Body() body: Record<string, unknown>) {
        return this.financeService.createAlias(this.requireLedger(ledgerId), this.parseAlias(body))
    }

    @Put('rules/:ledgerId/aliases/:id')
    updateAlias(@Param('ledgerId') ledgerId: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.financeService.updateAlias(this.requireLedger(ledgerId), id, this.parseAliasPatch(body))
    }

    @Delete('rules/:ledgerId/aliases/:id')
    deleteAlias(@Param('ledgerId') ledgerId: string, @Param('id') id: string) {
        return this.financeService.deleteAlias(this.requireLedger(ledgerId), id)
    }

    @Get('calculate/execution-types-sums/:ledgerId')
    getExecutionTypesWithAmounts(
        @Param('ledgerId') ledgerId: string
    ): ExecutionTypeWithAmounts[] | { message: string } {
        const appendedFileName = this.requireLedger(ledgerId)
        const result =
            this.financeService.getExecutionTypesWithAmounts(appendedFileName)
        if (!result)
            return {
                message: 'Required fields missing in CSV for this calculation.',
            }
        return result
    }

    @Get('calculate/top-spending-categories/:ledgerId')
    getTopSpendingCategoriesForMonth(
        @Param('ledgerId') ledgerId: string,
        @Query('top') top = '3',
        @Query('month') month = '1',
        @Query('year') year = '2024'
    ): TopSpendingCategoryForMonth[] | { message: string } {
        const appendedFileName = this.requireLedger(ledgerId)
        const result = this.financeService.getTopSpendingCategoriesForMonth(
            appendedFileName,
            Number(top),
            Number(month),
            Number(year)
        )
        if (!result || result.length === 0)
            return {
                message: 'Required fields missing in CSV for this calculation.',
            }
        return result
    }

    @Get('calculate/most-amount-per-weekday/:ledgerId')
    getMostAmountSpentPerWeekday(
        @Param('ledgerId') ledgerId: string
    ): AmountPerWeekday[] | { message: string } {
        const appendedFileName = this.requireLedger(ledgerId)
        const result =
            this.financeService.getMostAmountSpentPerWeekday(appendedFileName)
        if (!result || result.length === 0)
            return {
                message: 'Required fields missing in CSV for this calculation.',
            }
        return result
    }

    @Get('calculate/highest-spending-day/:ledgerId')
    getHighestSpendingDay(
        @Param('ledgerId') ledgerId: string
    ): AmountPerWeekday | { message: string } {
        const appendedFileName = this.requireLedger(ledgerId)
        const result =
            this.financeService.getHighestSpendingDay(appendedFileName)
        if (!result)
            return {
                message: 'Required fields missing in CSV for this calculation.',
            }
        return result
    }

    private requireLedger(ledgerId: string): string {
        this.financeService.getLedger(ledgerId)
        return ledgerId
    }

    private requireText(value: unknown, field: string): string {
        if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${field} is required`)
        return value.trim()
    }

    private requireNecessity(value: unknown): 'necessity' | 'convenience' {
        if (value !== 'necessity' && value !== 'convenience') throw new BadRequestException('necessity must be necessity or convenience')
        return value
    }

    private parseAlias(body: Record<string, unknown>): Omit<AliasRule, 'id'> {
        const value = this.requireText(body.value, 'value')
        const categoryId = this.requireText(body.categoryId, 'categoryId')
        const field: AliasRule['field'] = body.field === 'text' || body.field === 'transaction_type' || body.field === 'category' ? body.field : 'any'
        return { value, categoryId, field, transactionType: typeof body.transactionType === 'string' ? body.transactionType.trim() || undefined : undefined, statementId: typeof body.statementId === 'string' ? body.statementId.trim() || undefined : undefined }
    }

    private parseAliasPatch(body: Record<string, unknown>): Partial<Omit<AliasRule, 'id'>> {
        return {
            ...(body.value === undefined ? {} : { value: this.requireText(body.value, 'value') }),
            ...(body.categoryId === undefined ? {} : { categoryId: this.requireText(body.categoryId, 'categoryId') }),
            ...(body.field === undefined ? {} : { field: (body.field === 'text' || body.field === 'transaction_type' || body.field === 'category' ? body.field : 'any') as AliasRule['field'] }),
            ...(body.transactionType === undefined ? {} : { transactionType: typeof body.transactionType === 'string' ? body.transactionType.trim() || undefined : undefined }),
            ...(body.statementId === undefined ? {} : { statementId: typeof body.statementId === 'string' ? body.statementId.trim() || undefined : undefined }),
            ...(body.excludedStatementIds === undefined ? {} : { excludedStatementIds: Array.isArray(body.excludedStatementIds) ? body.excludedStatementIds.filter((value): value is string => typeof value === 'string') : [] }),
        }
    }

    private parseScope(
        mode: string,
        month?: string,
        year?: string,
        from?: string,
        to?: string
    ): FinanceScope {
        if (mode === 'all') return { mode: 'all' }

        if (mode === 'range') {
            if (!this.isDateKey(from) || !this.isDateKey(to) || from > to) {
                throw new BadRequestException('from and to must be valid dates with from before to')
            }
            return { mode: 'range', from, to }
        }

        const current = new Date()
        const requestedYear = Number(year ?? current.getFullYear())
        if (!Number.isInteger(requestedYear) || requestedYear < 1900 || requestedYear > 2100) {
            throw new BadRequestException('year must be an integer between 1900 and 2100')
        }

        if (mode === 'year') return { mode: 'year', year: requestedYear }
        if (mode !== 'month') {
            throw new BadRequestException('mode must be month, year, or all')
        }

        const requestedMonth = Number(month ?? current.getMonth() + 1)
        if (!Number.isInteger(requestedMonth) || requestedMonth < 1 || requestedMonth > 12) {
            throw new BadRequestException('month must be an integer between 1 and 12')
        }

        return { mode: 'month', month: requestedMonth, year: requestedYear }
    }

    private isDateKey(value: string | undefined): value is string {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
        const [year, month, day] = value.split('-').map(Number)
        const date = new Date(year, month - 1, day)
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    }
}
