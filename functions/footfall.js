exports.hadler = (snap, context) => {
      //console.log('major :',context.params.major);
      //console.log('minor :',context.params.minor);
      console.log('data :',change.data());
      // If we set `/users/marie/incoming_messages/134` to {body: "Hello"} then
      // context.params.userId == "marie";
      // context.params.messageCollectionId == "incoming_messages";
      // context.params.messageId == "134";
      // ... and ...
      // change.after.data() == {body: "Hello"}
    };
