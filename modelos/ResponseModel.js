export class ResponseModel {
    constructor(data, responseFlag = 0, message = 'Success', statusCode = 200) {
        this.data = data;
        this.statusCode = statusCode;
        this.message = message;
        this.responseFlag = responseFlag;
    }
}