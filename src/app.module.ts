import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { CsvParserService } from './csv-parser/csv-parser.service.js'
import { FinanceController } from './finance/finance.controller.js'
import { FinanceService } from './finance/finance.service.js'
import { RuleStoreService } from './finance/rule-store.service.js'

@Module({
    imports: [
        ConfigModule.forRoot(),
        MulterModule.register({
            dest:
                process.env.CSV_FILE_UPLOAD_DESTINATION || './data/uploads/csv',
        }),
    ],
    controllers: [AppController, FinanceController],
    providers: [AppService, FinanceService, CsvParserService, RuleStoreService],
})
export class AppModule {}
