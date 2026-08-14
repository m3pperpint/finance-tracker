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
import { basename, join } from 'path'

import { FinanceService } from './finance.service.js'
import {
    CsvColumnMappings,
    ExecutionTypeWithAmounts,
    TopSpendingCategoryForMonth,
    AmountPerWeekday,
    FinanceScope,
    AliasRule,
} from '../core/index.js'
import { CsvParserService } from '../csv-parser/csv-parser.service.js'

@Controller('finance')
export class FinanceController {
    private readonly uploadDirectory =
        process.env.CSV_FILE_UPLOAD_DESTINATION || './data/uploads/csv'

    constructor(
        private readonly financeService: FinanceService,
        private csvParsingService: CsvParserService
    ) {}

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    uploadCSVFile(
        @Body('columnMappings') columnMappingsString: string,
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 }), // 1 MB
                ],
            })
        )
        file: Express.Multer.File
    ) {
        const columnMappings = columnMappingsString
            ? (JSON.parse(columnMappingsString) as CsvColumnMappings)
            : {}

        this.csvParsingService.overrideCsvColumnNames(
            join(this.uploadDirectory, file.filename),
            columnMappings
        )

        return { message: 'File uploaded successfully!', fileName: file.filename }
    }

    @Get('dashboard/:fileName')
    getDashboard(
        @Param('fileName') fileName: string,
        @Query('mode') mode = 'month',
        @Query('month') month?: string,
        @Query('year') year?: string,
        @Query('top') top = '5'
    ) {
        const requestedTop = Number(top)
        if (!Number.isInteger(requestedTop) || requestedTop < 1 || requestedTop > 50) {
            throw new BadRequestException('top must be an integer between 1 and 50')
        }

        return this.financeService.getDashboard(
            this.getFilePath(fileName),
            this.parseScope(mode, month, year),
            requestedTop
        )
    }

    @Get('rules/:fileName')
    getRules(@Param('fileName') fileName: string) {
        return this.financeService.getRules(this.getFilePath(fileName))
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

    @Post('rules/:fileName/aliases')
    createAlias(@Param('fileName') fileName: string, @Body() body: Record<string, unknown>) {
        return this.financeService.createAlias(this.getFilePath(fileName), this.parseAlias(body))
    }

    @Put('rules/:fileName/aliases/:id')
    updateAlias(@Param('fileName') fileName: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.financeService.updateAlias(this.getFilePath(fileName), id, this.parseAliasPatch(body))
    }

    @Delete('rules/:fileName/aliases/:id')
    deleteAlias(@Param('fileName') fileName: string, @Param('id') id: string) {
        return this.financeService.deleteAlias(this.getFilePath(fileName), id)
    }

    @Get('calculate/execution-types-sums/:fileName')
    getExecutionTypesWithAmounts(
        @Param('fileName') fileName: string
    ): ExecutionTypeWithAmounts[] | { message: string } {
        const appendedFileName = this.getFilePath(fileName)
        const result =
            this.financeService.getExecutionTypesWithAmounts(appendedFileName)
        if (!result)
            return {
                message: 'Required fields missing in CSV for this calculation.',
            }
        return result
    }

    @Get('calculate/top-spending-categories/:fileName')
    getTopSpendingCategoriesForMonth(
        @Param('fileName') fileName: string,
        @Query('top') top = '3',
        @Query('month') month = '1',
        @Query('year') year = '2024'
    ): TopSpendingCategoryForMonth[] | { message: string } {
        const appendedFileName = this.getFilePath(fileName)
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

    @Get('calculate/most-amount-per-weekday/:fileName')
    getMostAmountSpentPerWeekday(
        @Param('fileName') fileName: string
    ): AmountPerWeekday[] | { message: string } {
        const appendedFileName = this.getFilePath(fileName)
        const result =
            this.financeService.getMostAmountSpentPerWeekday(appendedFileName)
        if (!result || result.length === 0)
            return {
                message: 'Required fields missing in CSV for this calculation.',
            }
        return result
    }

    @Get('calculate/highest-spending-day/:fileName')
    getHighestSpendingDay(
        @Param('fileName') fileName: string
    ): AmountPerWeekday | { message: string } {
        const appendedFileName = this.getFilePath(fileName)
        const result =
            this.financeService.getHighestSpendingDay(appendedFileName)
        if (!result)
            return {
                message: 'Required fields missing in CSV for this calculation.',
            }
        return result
    }

    private getFilePath(fileName: string): string {
        const safeFileName = basename(fileName)
        if (!fileName || safeFileName !== fileName || ['.', '..'].includes(safeFileName)) {
            throw new BadRequestException('fileName must be a filename in the upload directory')
        }
        return join(this.uploadDirectory, safeFileName)
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
        year?: string
    ): FinanceScope {
        if (mode === 'all') return { mode: 'all' }

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
}
