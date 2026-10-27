import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateApdDto {
  @IsString({ message: 'Введіть назву документа.' })
  @IsNotEmpty({ message: 'Введіть назву документа.' })
  @MaxLength(200)
  title: string;

  @IsArray({ message: 'Додайте хоча б один псевдо.' })
  @ArrayMinSize(1, { message: 'Додайте хоча б один псевдо.' })
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true, message: 'Псевдо не може бути порожнім.' })
  @MaxLength(100, { each: true })
  pseudos: string[];
}
