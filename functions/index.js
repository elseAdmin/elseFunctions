const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const firestore = admin.firestore();
const realtimeDb = admin.database();

exports.parkingSensorEventListenerUnityOneRohini = functions.database.ref('/unityOneRohini/parking')
    .onWrite((snapshot, context) => {

      var afterValueMap = new Map();
      snapshot.after.forEach((child) => {
        model = new SensorModel(child.val().major,child.val().minor,child.val().name,child.val().updatedAt,child.val().userUid,child.val().value);
        afterValueMap.set(child.val().name,model);
      });

      var beforeValueMap = new Map();
      snapshot.before.forEach((child) => {
        model = new SensorModel(child.val().major,child.val().minor,child.val().name,child.val().updatedAt,child.val().userUid,child.val().value);
        beforeValueMap.set(child.val().name,model);
      });

      getChangedSensors(beforeValueMap,afterValueMap);
  return true;
});

function getChangedSensors(beforeValueMap,afterValueMap){
  var changedSensors = new Map();
  beforeValueMap.forEach((child)=>{
    var data = compareSensorData(child, afterValueMap.get(child.name));
    if(data){
      changedSensors.set(afterValueMap.get(child.name).name,afterValueMap.get(child.name));
    }
  });
  console.log('changed sensor map ',changedSensors);

  changedSensors.forEach((child)=>{
    if(child.value===1){
      getBeaconData(child);
    }else{
      //clear beacon visits and mark user at proxi as none;
      //do we really need to clear this data ?
      if(child.userUid !== undefined){
        var user = child.userUid;
        console.log('user stamped at sensor',user);
        firestore.collection(`users/${user}/parking`).where('status','==','active')
          .get()
          .then((querySnapshot) => {
              console.log(querySnapshot);
              querySnapshot.forEach((doc) => {
                  console.log(doc.id, " => ", doc.data());
                  // Build doc ref from doc.id
                  firestore.collection(`users/${user}/parking`).doc(doc.id).update({'status':'inactive',
                    'parkingOutTime':Date.now(),});
              });
              return '';
         }).catch(reason => {
            console.log(reason);
        });
      }
      realtimeDb.ref('/unityOneRohini/parking').child(child.name).update({'userUid':'none'});
    }
  });
  return true;
}

function getBeaconData(sensor){
   var major = sensor.major;
   var minor = sensor.minor;
   var updatedAt = sensor.updatedAt;
   var path = `unityOneRohini/beacons/parking/${major}/${minor}/`;
   var userVsVisitsMap = new Map();
   //below query will fetch all the visits for the parking beacon that are marked in future in reference to the updated at time of the proxi sensor
   firestore.collection(path).where('timestamp',">=",updatedAt).get().then(collections => {
        collections.forEach((child) => {
          data = child.data();
          if(userVsVisitsMap.get(data.userUid) === undefined){
            userVsVisitsMap.set(data.userUid,data.distance);
          }else{
            var avgDist = userVsVisitsMap.get(data.userUid);
            avgDist = (avgDist + data.distance)/2;
            userVsVisitsMap.set(data.userUid,avgDist);
          }
        });
       identifyUser(userVsVisitsMap,sensor);
       return '';
    }).catch(reason => {
        console.log(reason);
    });
}

function identifyUser(userVsVisitsMap,sensor){
  var sensorName = sensor.name;
  var maxDist = 1000;
  var user;
    userVsVisitsMap.forEach((value, key)=>{
      if(value<maxDist){
        maxDist = value;
        user = key;
      }
    });
    console.log('identified user ',user);
    realtimeDb.ref('/unityOneRohini/parking').child(sensorName).update({'userUid':user}); //,'updatedAt':Date.now()
    //stamp proxi details to user at firestore
    firestore.collection(`users/${user}/parking`).add({
      'major': sensor.major,
      'minor':sensor.minor,
      'proxiName':sensor.name,
      'parkingInTime':Date.now(),
      'parkingOutTime':0,
      'status':'active'
    });
}


function compareSensorData(beforeData, afterData){
    if(afterData.value === beforeData.value){
      return false;
    }
    return true;
}

class SensorModel{
  constructor(major,minor,name,updatedAt,userUid,value){
    this.major=major;
    this.minor=minor;
    this.name=name;
    this.updatedAt=updatedAt;
    this.userUid=userUid;
    this.value=value;
  }
}
